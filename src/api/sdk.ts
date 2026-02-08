import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Session, ApiResponse } from '../types';
import { collectProjectSecrets, collectUserSecrets } from '../sandbox';

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const sdkRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const SdkStreamSchema = z.object({
  sessionId: z.string(),
  prompt: z.string().min(1).max(100000),
  cwd: z.string().optional(),
});

// Shell-escape a string for safe command-line usage
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// POST /api/sdk/stream - True progressive streaming via SDK in container
sdkRoutes.post('/stream', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');

  // Auth validation
  if (!user.claudeToken) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'No Claude token. Please re-authenticate.',
    }, 401);
  }

  if (!user.claudeToken.startsWith('sk-ant-oat01-')) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Only OAuth tokens accepted. Run `claude setup-token`.',
    }, 401);
  }

  const body = await c.req.json();
  const parsed = SdkStreamSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  const { sessionId, prompt, cwd: requestCwd } = parsed.data;

  // Verify session ownership + ensure sandbox is awake and healthy
  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found or sandbox terminated. Create a new session.',
    }, 404);
  }

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  const sdkSessionId = session.sdkSessionId || '';
  const cwd = requestCwd || session.projectPath || '/workspace';

  // Build command to run SDK script
  const cmd = [
    'node /opt/claude-agent/claude-agent.js',
    shellEscape(prompt),
    shellEscape(sdkSessionId),
    shellEscape(cwd),
  ].join(' ');

  try {
    console.log(`[sdk/stream] session=${sessionId.slice(0, 8)} status=${session.status} sandbox=${session.sandboxId?.slice(0, 8)}`);
    // Get streaming output from sandbox
    const stream = await sandboxManager.execStreamInSandbox(
      session.sandboxId,
      cmd,
      {
        cwd,
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken,
          NODE_PATH: '/usr/local/lib/node_modules',
          ...collectProjectSecrets(c.env),
          ...await collectUserSecrets(c.env.SESSIONS_KV, user.id),
        },
        timeout: 300000,
      }
    );

    // Set up SSE response pipeline
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Helper to write an SSE event
    const writeEvent = async (data: Record<string, unknown>) => {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
      );
    };

    c.executionCtx.waitUntil((async () => {
      const reader = stream.getReader();
      let sseBuffer = '';     // Level 1: sandbox SSE line buffer
      let stdoutBuffer = '';  // Level 2: JSON line buffer from script stdout
      let newSdkSessionId = sdkSessionId;
      let fullText = '';
      let hasData = false;

      // Send initial event so frontend knows the stream is connected
      await writeEvent({ type: 'connected' });

      // Heartbeat keeps the SSE connection alive through Cloudflare edge
      // and network intermediaries that close idle connections (~100s)
      const heartbeat = setInterval(async () => {
        try {
          await writeEvent({ type: 'heartbeat', timestamp: Date.now() });
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Level 1: Parse sandbox SSE events
          sseBuffer += decoder.decode(value, { stream: true });
          const sseLines = sseBuffer.split('\n');
          sseBuffer = sseLines.pop() || '';

          for (const line of sseLines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            let event: {
              type: string;
              data?: string;
              exitCode?: number;
              error?: string;
            };
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }

            // Extract stdout data for Level 2 parsing
            if (event.type === 'stdout' && event.data) {
              stdoutBuffer += event.data;

              // Level 2: Split on newlines to get complete JSON lines
              const jsonLines = stdoutBuffer.split('\n');
              stdoutBuffer = jsonLines.pop() || '';

              for (const jsonLine of jsonLines) {
                if (!jsonLine.trim()) continue;

                let msg: Record<string, unknown>;
                try {
                  msg = JSON.parse(jsonLine);
                } catch {
                  continue;
                }

                // Re-emit parsed SDK events as our SSE events
                hasData = true;
                switch (msg.type) {
                  case 'session-init':
                    newSdkSessionId = msg.sessionId as string;
                    await writeEvent({
                      type: 'session-init',
                      sessionId: newSdkSessionId,
                    });
                    break;

                  case 'text-delta':
                    fullText += msg.text as string;
                    await writeEvent({
                      type: 'text',
                      content: msg.text,
                    });
                    break;

                  case 'tool-start':
                    await writeEvent({
                      type: 'tool-start',
                      name: msg.name,
                      input: msg.input,
                    });
                    break;

                  case 'tool-result':
                    await writeEvent({
                      type: 'tool-result',
                      name: msg.name,
                      output: msg.output,
                    });
                    break;

                  case 'done':
                    fullText = (msg.fullText as string) || fullText;
                    newSdkSessionId = (msg.sessionId as string) || newSdkSessionId;
                    await writeEvent({
                      type: 'done',
                      sessionId: newSdkSessionId,
                      fullText,
                    });
                    break;

                  case 'error':
                    await writeEvent({
                      type: 'error',
                      content: msg.error || 'SDK error',
                    });
                    break;
                }
              }
            } else if (event.type === 'stderr' && event.data) {
              // Forward stderr from claude-agent.js
              const trimmed = event.data.trim();
              if (!trimmed) continue;

              // Try to parse as JSON error from our script
              if (trimmed.startsWith('{')) {
                try {
                  const parsed = JSON.parse(trimmed) as { type?: string; error?: string };
                  if (parsed.type === 'error') {
                    await writeEvent({ type: 'error', content: parsed.error || 'Script error' });
                    continue;
                  }
                } catch {
                  // Not valid JSON, fall through to raw forwarding
                }
              }

              // Forward raw stderr as error (catches module-not-found, crashes, etc.)
              await writeEvent({ type: 'error', content: trimmed });
            } else if (event.type === 'exit') {
              // Sandbox exec finished — detect non-zero exit without stdout data
              if (event.exitCode && event.exitCode !== 0 && !hasData) {
                await writeEvent({
                  type: 'error',
                  content: `Claude Code process exited with code ${event.exitCode}`,
                });
              }
            } else if (event.type === 'error') {
              await writeEvent({
                type: 'error',
                content: event.error || 'Sandbox error',
              });
            }
          }
        }

        // Update session with new SDK sessionId for continuity
        if (newSdkSessionId && newSdkSessionId !== session.sdkSessionId) {
          const updatedSession: Session = {
            ...session,
            sdkSessionId: newSdkSessionId,
          };
          await c.env.SESSIONS_KV.put(
            `session:${sessionId}`,
            JSON.stringify(updatedSession)
          );
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Stream error';
        const isRpcDisconnect = errMsg.includes('disconnected prematurely')
          || errMsg.includes('RPC');

        if (isRpcDisconnect) {
          await writeEvent({
            type: 'error',
            content: 'Sandbox connection lost. The container may have run out of memory or crashed. Try sending your message again.',
          });
        } else {
          await writeEvent({ type: 'error', content: errMsg });
        }
      } finally {
        clearInterval(heartbeat);
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      }
    })());

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start SDK stream',
    }, 500);
  }
});
