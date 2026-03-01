import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Session, Message, ApiResponse } from '../types';
import { collectProjectSecrets, collectUserSecrets } from '../sandbox';
import type { SandboxManager } from '../sandbox';
import { summarizeSession } from '../services/session-summarizer';
import { assembleSandboxConfig, assembleSandboxConfigWithHashes } from '../config-assembly';

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const sdkRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const SdkStreamSchema = z.object({
  sessionId: z.string(),
  prompt: z.string().min(1).max(100000),
  cwd: z.string().optional(),
  mode: z.enum(['agent', 'plan']).default('agent'),
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

  const { sessionId, prompt, cwd: requestCwd, mode } = parsed.data;

  // Assemble config from KV so we can re-inject on container wake
  const sandboxConfig = await assembleSandboxConfig(c.env.SESSIONS_KV, user.id);

  // Verify session ownership + ensure sandbox is awake and healthy
  // Pass config so ensureConfigInjected can restore files after recycle
  const session = await sandboxManager.getOrWakeSandbox(sessionId, sandboxConfig);

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

  // Persist user message to KV (so history survives refresh)
  const userMessageId = crypto.randomUUID();
  const userMessage: Message = {
    id: userMessageId,
    sessionId,
    role: 'user',
    content: prompt,
    timestamp: new Date().toISOString(),
  };
  await c.env.SESSIONS_KV.put(
    `message:${sessionId}:${userMessageId}`,
    JSON.stringify(userMessage),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );

  // Strip [command:/name] or [agent:/name] UI prefix before sending to Claude.
  // KV already has the original (for chip display in MessageAttachments).
  // Sending the prefix raw causes Claude to try invoking a Skill tool
  // (a Claude Code CLI feature not available in the sandbox).
  const cmdPrefixMatch = prompt.match(/^\[(command|agent):\/([^\]]+)\]\n/);
  let sdkPrompt = prompt;
  if (cmdPrefixMatch) {
    const [fullMatch, kind, name] = cmdPrefixMatch;
    const body = prompt.slice(fullMatch.length);
    sdkPrompt = kind === 'agent'
      ? `Use the "${name}" agent (available via the Task tool) to handle this request. The agent's instructions:\n\n${body}`
      : `The user is running the /${name} command. Follow the instructions below:\n\n${body}`;
  }

  // Build command to run SDK script
  const cmd = [
    'node /opt/claude-agent/claude-agent.js',
    shellEscape(sdkPrompt),
    shellEscape(sdkSessionId),
    shellEscape(cwd),
  ].join(' ');

  try {
    console.log(`[sdk/stream] session=${sessionId.slice(0, 8)} status=${session.status} sandbox=${session.sandboxId?.slice(0, 8)}`);

    // Compute fresh MCP config from sandboxConfig (not stale session-mcp KV key).
    // This ensures MCP servers added after session creation are immediately available.
    const freshMcpConfig = {
      ...(sandboxConfig.mcpServers || {}),
      ...(sandboxConfig.pluginConfigs?.mcpServers || {}),
      ...(sandboxConfig.geminiMcpServers || {}),
    };
    const mcpConfigStr = Object.keys(freshMcpConfig).length > 0
      ? JSON.stringify(freshMcpConfig)
      : null;

    // Get streaming output from sandbox
    const stream = await sandboxManager.execStreamInSandbox(
      session.sandboxId,
      cmd,
      {
        cwd,
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken,
          NODE_PATH: '/usr/local/lib/node_modules',
          CLAUDE_CONFIG_DIR: '/root/.claude',
          ...collectProjectSecrets(c.env),
          ...await collectUserSecrets(c.env.SESSIONS_KV, user.id),
          ...(mcpConfigStr ? { CLAUDE_MCP_SERVERS: mcpConfigStr } : {}),
          VF_SESSION_MODE: mode,
          VF_AUTO_CONTEXT: sandboxConfig.autoContext === false ? '0' : '1',
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

      // Notify frontend if config was restored after container recycle
      const meta = (session.metadata ?? {}) as Record<string, unknown>;
      if (meta.configRestoredAt) {
        await writeEvent({
          type: 'config-restored',
          restoredAt: meta.configRestoredAt,
        });
      }

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
                      id: msg.id,
                      name: msg.name,
                      input: msg.input,
                    });
                    break;

                  case 'tool-result':
                    await writeEvent({
                      type: 'tool-result',
                      id: msg.id,
                      name: msg.name,
                      output: msg.output,
                    });
                    break;

                  case 'session-reset':
                    // Agent script signals the old session is stale — clear it
                    // so we don't try to resume it again next time
                    newSdkSessionId = '';
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

              // Debug-prefixed lines are server-side only — don't forward to user
              if (trimmed.startsWith('[claude-agent]')) {
                console.log(`[sdk/stream] agent-stderr: ${trimmed.slice(0, 200)}`);
                continue;
              }

              // Clean up raw stack traces: extract just the first meaningful line
              let cleanMsg = trimmed;
              if (trimmed.includes('\n') || trimmed.includes(' at ')) {
                const firstLine = trimmed.split('\n')[0].replace(/\s+at\s+.+$/, '').trim();
                cleanMsg = firstLine || 'Internal error in Claude Code process';
              }

              // Forward cleaned stderr as error
              await writeEvent({ type: 'error', content: cleanMsg });
            } else if (event.type === 'exit') {
              // Sandbox exec finished — detect non-zero exit without stdout data
              if (event.exitCode && event.exitCode !== 0 && !hasData) {
                const reason = (event as Record<string, unknown>).reason as string || 'unknown';
                await writeEvent({
                  type: 'error',
                  content: reason === 'context-timeout'
                    ? 'Sandbox is warming up — try again in a moment.'
                    : 'Claude Code process crashed. Try sending your message again.',
                });
                // Clear stale sdkSessionId so next attempt starts fresh
                newSdkSessionId = '';
              }
            } else if (event.type === 'error') {
              await writeEvent({
                type: 'error',
                content: event.error || 'Sandbox error',
              });
            }
          }
        }

        // Safety net: if the stream ended with no SDK data and no text,
        // the command was likely unrecognized or the plugin isn't installed.
        if (!hasData && !fullText) {
          await writeEvent({
            type: 'error',
            content: 'Claude returned no output. The command may not be recognized — check if the plugin is installed.',
          });
        }

        // Update session with new SDK sessionId for continuity.
        // Also persist when sdkSessionId was cleared (session-reset) so we
        // don't keep retrying a stale session on the next message.
        if (newSdkSessionId !== (session.sdkSessionId || '')) {
          const updatedSession: Session = {
            ...session,
            sdkSessionId: newSdkSessionId || undefined,
          };
          await c.env.SESSIONS_KV.put(
            `session:${sessionId}`,
            JSON.stringify(updatedSession)
          );
        }

        // Persist assistant message to KV (so history survives refresh)
        if (fullText) {
          const assistantMessageId = crypto.randomUUID();
          const assistantMessage: Message = {
            id: assistantMessageId,
            sessionId,
            role: 'assistant',
            content: fullText,
            timestamp: new Date().toISOString(),
          };
          await c.env.SESSIONS_KV.put(
            `message:${sessionId}:${assistantMessageId}`,
            JSON.stringify(assistantMessage),
            { expirationTtl: 7 * 24 * 60 * 60 }
          );
        }

        // Sync config from container back to KV (non-blocking best-effort).
        // Catches in-container CLAUDE.md edits so they persist across recycles.
        try {
          await sandboxManager.syncConfigFromContainer(
            sessionId,
            user.id,
            c.env.SESSIONS_KV
          );
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          console.error(`[sdk/stream] config sync-back failed: ${msg}`);
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
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start SDK stream',
    }, 500);
  }
});

// POST /api/sdk/persist - Persist assistant message to KV after WS stream completes
sdkRoutes.post('/persist', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    sessionId: string;
    content: string;
    sdkSessionId?: string;
    costUsd?: number;
  }>();

  const { sessionId, content, sdkSessionId, costUsd } = body;
  if (!sessionId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Missing sessionId' }, 400);
  }
  // If content is empty (e.g. agent crashed before producing text), skip persist
  // but still update sdkSessionId and return success to avoid 400 noise
  if (!content) {
    if (sdkSessionId !== undefined) {
      const rawSession = await c.env.SESSIONS_KV.get(`session:${sessionId}`);
      if (rawSession) {
        const session = JSON.parse(rawSession) as Session;
        if ((session.sdkSessionId || '') !== sdkSessionId) {
          const updated: Session = { ...session, sdkSessionId: sdkSessionId || undefined };
          await c.env.SESSIONS_KV.put(`session:${sessionId}`, JSON.stringify(updated));
        }
      }
    }
    return c.json({ success: true, triggeredAlerts: [] });
  }

  // Persist assistant message
  const msgId = crypto.randomUUID();
  const assistantMessage: Message = {
    id: msgId,
    sessionId,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  };
  await c.env.SESSIONS_KV.put(
    `message:${sessionId}:${msgId}`,
    JSON.stringify(assistantMessage),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );

  // Update sdkSessionId if changed
  if (sdkSessionId !== undefined) {
    const rawSession = await c.env.SESSIONS_KV.get(`session:${sessionId}`);
    if (rawSession) {
      const session = JSON.parse(rawSession) as Session;
      if ((session.sdkSessionId || '') !== sdkSessionId) {
        const updated: Session = { ...session, sdkSessionId: sdkSessionId || undefined };
        await c.env.SESSIONS_KV.put(`session:${sessionId}`, JSON.stringify(updated));
      }
    }
  }

  // Best-effort config sync
  const sandboxManager = c.get('sandboxManager');
  try {
    await sandboxManager.syncConfigFromContainer(sessionId, user.id, c.env.SESSIONS_KV);
  } catch {}

  // Fire-and-forget session summary every 10 messages
  const messageCount = await c.env.SESSIONS_KV.list({ prefix: `message:${sessionId}:` })
    .then((r) => r.keys.length)
    .catch(() => 0);
  if (messageCount > 0 && messageCount % 10 === 0) {
    summarizeSession(c.env.SESSIONS_KV, user.id, sessionId)
      .then(async (summary) => {
        if (!summary) return;
        // Store in KV for UI retrieval
        await c.env.SESSIONS_KV.put(
          `summary:${sessionId}`,
          JSON.stringify({ text: summary, updatedAt: new Date().toISOString(), messageCount }),
          { expirationTtl: 60 * 60 * 24 * 30 }
        );
        // Write to container for next-session gather-context.sh injection
        const rawSession = await c.env.SESSIONS_KV.get(`session:${sessionId}`);
        if (!rawSession) return;
        const sess = JSON.parse(rawSession) as Session;
        if (!sess.sandboxId) return;
        await sandboxManager.execInSandbox(sess.sandboxId, 'mkdir -p /workspace/.vaporforge');
        await sandboxManager.writeFile(sess.sandboxId, '/workspace/.vaporforge/session-summary.md', summary);
      })
      .catch(() => {});
  }

  // Check usage alerts if cost data available
  let triggeredAlerts: import('./billing').AlertConfig[] = [];
  if (typeof costUsd === 'number' && costUsd > 0) {
    try {
      triggeredAlerts = await checkUsageAlerts(c.env, user.id, sessionId, costUsd);
    } catch (e) {
      console.error('[persist] alert check failed:', e);
    }
  }

  return c.json({ success: true, triggeredAlerts });
});

// ─── Alert Triggering ─────────────────────────────────────────────────────────

async function checkUsageAlerts(
  env: Env,
  userId: string,
  sessionId: string,
  costUsd: number
): Promise<import('./billing').AlertConfig[]> {
  // Read max budget (user-config:{userId}:max-budget-usd)
  const maxBudgetRaw = await env.AUTH_KV.get(`user-config:${userId}:max-budget-usd`);
  const maxBudgetUsd = maxBudgetRaw ? parseFloat(maxBudgetRaw) : null;
  if (!maxBudgetUsd || maxBudgetUsd <= 0) return [];

  // Accumulate session spend
  const spendKey = `session-spend:${sessionId}`;
  const prevRaw = await env.SESSIONS_KV.get(spendKey);
  const prevSpend = prevRaw ? parseFloat(prevRaw) : 0;
  const newSpend = prevSpend + costUsd;
  await env.SESSIONS_KV.put(spendKey, String(newSpend), { expirationTtl: 7 * 24 * 60 * 60 });

  // Read which alerts have already fired this session
  const firedKey = `session-alert-fired:${sessionId}`;
  const firedRaw = await env.SESSIONS_KV.get(firedKey);
  const firedIds: string[] = firedRaw ? (JSON.parse(firedRaw) as string[]) : [];

  // Load user's billing alerts
  const alertsRaw = await env.AUTH_KV.get(`billing-alerts:${userId}`);
  if (!alertsRaw) return [];
  const alerts = JSON.parse(alertsRaw) as import('./billing').AlertConfig[];

  const spendPct = (newSpend / maxBudgetUsd) * 100;
  const nowIso = new Date().toISOString();
  const newlyTriggered: import('./billing').AlertConfig[] = [];
  const newFiredIds = [...firedIds];

  for (const alert of alerts) {
    if (!alert.enabled) continue;
    if (firedIds.includes(alert.id)) continue;
    if (spendPct < alert.thresholdPct) continue;

    // Threshold crossed — mark as triggered
    alert.triggeredAt = nowIso;
    alert.triggeredCount += 1;
    newlyTriggered.push({ ...alert });
    newFiredIds.push(alert.id);
  }

  if (newlyTriggered.length === 0) return [];

  // Persist updated alert records and fired set
  await Promise.all([
    env.AUTH_KV.put(`billing-alerts:${userId}`, JSON.stringify(alerts)),
    env.SESSIONS_KV.put(firedKey, JSON.stringify(newFiredIds), { expirationTtl: 7 * 24 * 60 * 60 }),
  ]);

  return newlyTriggered;
}

// GET /api/sdk/replay/:sessionId?msgId=&offset= — serve buffered chunks for reconnect
sdkRoutes.get('/replay/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const msgId = c.req.query('msgId') || '';
  const offset = parseInt(c.req.query('offset') || '0', 10);

  if (!msgId) {
    return c.json({ error: 'Missing msgId' }, 400);
  }

  // Validate msgId — only alphanumeric + hyphens, max 64 chars (UUIDs always match)
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(msgId)) {
    return c.json({ error: 'Invalid msgId' }, 400);
  }

  // Verify session exists and belongs to this user
  const raw = await c.env.SESSIONS_KV.get(`session:${sessionId}`);
  if (!raw) {
    return c.json({ error: 'Session not found' }, 404);
  }
  const session = JSON.parse(raw);
  if (session.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  if (!session.sandboxId) {
    return c.json({ error: 'Sandbox not active' }, 400);
  }

  const filePath = `/tmp/vf-stream-${msgId}.jsonl`;
  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    `[ -f "${filePath}" ] && cat "${filePath}" || echo '__NOT_FOUND__'`,
    { timeout: 5000 }
  );

  if (!result.stdout || result.stdout.trim() === '__NOT_FOUND__') {
    console.log(`[sdk/replay] buffer not found for msgId=${msgId.slice(0, 8)}`);
    return c.json({ error: 'Stream buffer not found' }, 404);
  }

  const lines = result.stdout.split('\n').filter((l) => l.trim());
  const safeOffset = Math.max(0, Math.min(offset, lines.length));
  console.log(`[sdk/replay] msgId=${msgId.slice(0, 8)} total=${lines.length} offset=${safeOffset} returning=${lines.length - safeOffset}`);
  return c.json({ chunks: lines.slice(safeOffset), total: lines.length });
});

// GET /api/sdk/summary/:sessionId — fetch stored session summary from KV
sdkRoutes.get('/summary/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = await c.env.SESSIONS_KV.get<Session>(`session:${sessionId}`, 'json');
  if (!session || session.userId !== user.id) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }

  const stored = await c.env.SESSIONS_KV.get<{
    text: string;
    updatedAt: string;
    messageCount: number;
  }>(`summary:${sessionId}`, 'json');

  if (!stored) return c.json({ success: false, error: 'No summary yet' }, 404);
  return c.json({ success: true, data: stored });
});

// Standalone WS handler — called from router.ts with inline auth (no middleware)
export async function handleSdkWs(
  env: Env,
  request: Request,
  user: User,
  sandboxManager: SandboxManager
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') || '';
  const prompt = url.searchParams.get('prompt') || '';
  const cwd = url.searchParams.get('cwd') || '/workspace';
  const mode = url.searchParams.get('mode') || 'agent';
  const modelParam = url.searchParams.get('model') || '';
  const autonomyParam = url.searchParams.get('autonomy') || 'autonomous';
  const msgId = url.searchParams.get('msgId') || '';

  const MODEL_MAP: Record<string, string> = {
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
    opus: 'claude-opus-4-6',
    opusplan: 'opusplan',
    sonnet1m: 'claude-sonnet-4-6',
  };
  const resolvedModel = MODEL_MAP[modelParam] || '';
  const wants1m = modelParam === 'sonnet1m';

  if (!sessionId || !prompt) {
    return new Response('Missing sessionId or prompt', { status: 400 });
  }

  if (!user.claudeToken?.startsWith('sk-ant-oat01-')) {
    return new Response('Invalid OAuth token', { status: 401 });
  }

  const t0 = Date.now();

  // --- Phase 1: Config assembly + user secrets in parallel (both are KV reads) ---
  const [{ config: sandboxConfig, hashes }, userSecrets] = await Promise.all([
    assembleSandboxConfigWithHashes(env.SESSIONS_KV, user.id),
    collectUserSecrets(env.SESSIONS_KV, user.id),
  ]);
  const t1 = Date.now();
  console.log(`[sdk/ws] Phase 1 (config+secrets): ${t1 - t0}ms`);

  // --- Phase 2: Wake sandbox (needs config for restore path) ---
  const session = await sandboxManager.getOrWakeSandbox(sessionId, sandboxConfig);

  if (!session || session.userId !== user.id) {
    return new Response('Session not found', { status: 404 });
  }
  if (!session.sandboxId) {
    return new Response('Sandbox not active', { status: 400 });
  }
  const t2 = Date.now();
  console.log(`[sdk/ws] Phase 2 (wake): ${t2 - t1}ms`);

  // Strip command/agent prefix — content is embedded in prompt (1code pattern).
  // Frontend sends [command:/name]\n<content> or [agent:/name]\n<content>.
  const cmdPrefixMatch = prompt.match(/^\[(command|agent):\/([^\]]+)\]\n/);
  let sdkPrompt = prompt;
  if (cmdPrefixMatch) {
    const [fullMatch, kind, name] = cmdPrefixMatch;
    const body = prompt.slice(fullMatch.length);
    sdkPrompt = kind === 'agent'
      ? `Use the "${name}" agent (available via the Task tool) to handle this request. The agent's instructions:\n\n${body}`
      : `The user is running the /${name} command. Follow the instructions below:\n\n${body}`;
  }

  const sdkSessionId = session.sdkSessionId || '';

  // Compute fresh MCP config string (sync — no await needed)
  const freshMcpConfig = {
    ...(sandboxConfig.mcpServers || {}),
    ...(sandboxConfig.pluginConfigs?.mcpServers || {}),
    ...(sandboxConfig.geminiMcpServers || {}),
  };
  const mcpConfigStr = Object.keys(freshMcpConfig).length > 0
    ? JSON.stringify(freshMcpConfig)
    : null;

  // Log MCP config (diagnostic)
  const mcpNames = Object.keys(freshMcpConfig);
  console.log(`[sdk/ws] MCP servers for agent (${mcpNames.length}): ${mcpNames.join(', ')}`);
  if (mcpNames.length > 0) {
    for (const [name, cfg] of Object.entries(freshMcpConfig)) {
      const c = cfg as Record<string, unknown>;
      const transport = c.command ? 'stdio' : c.type || c.url ? 'http' : 'unknown';
      console.log(`[sdk/ws]   ${name}: ${transport}${c.command ? ` cmd=${c.command}` : ''}${c.url ? ` url=${String(c.url).slice(0, 60)}` : ''}`);
    }
  }

  try {
    // Prepare user message for KV persistence
    const userMsgId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMsgId,
      sessionId,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    // --- Phase 3: Container ops (sequential — CF Sandbox can't handle concurrent exec) ---
    // refreshMcpConfig: writes ~/.claude.json + npm install (skips if hashes match)
    await sandboxManager.refreshMcpConfig(session.sandboxId!, sandboxConfig, hashes);
    const t3a = Date.now();
    console.log(`[sdk/ws] Phase 3a (refreshMcp): ${t3a - t2}ms`);

    // startWsServer: ensures port 8765 is listening (fast if already running)
    await sandboxManager.startWsServer(session.sandboxId!);

    // writeContextFile + KV persist (file write must complete before WS proxy)
    await sandboxManager.writeContextFile(session.sandboxId!, {
      prompt: sdkPrompt,
      sessionId: sdkSessionId,
      cwd,
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken!,
        NODE_PATH: '/usr/local/lib/node_modules',
        CLAUDE_CONFIG_DIR: '/root/.claude',
        ...collectProjectSecrets(env),
        ...userSecrets,
        ...(mcpConfigStr ? { CLAUDE_MCP_SERVERS: mcpConfigStr } : {}),
        VF_SESSION_MODE: mode,
        VF_AUTO_CONTEXT: sandboxConfig.autoContext === false ? '0' : '1',
        ...(resolvedModel ? { VF_MODEL: resolvedModel } : {}),
        ...(wants1m ? { VF_1M_CONTEXT: '1' } : {}),
        VF_AUTONOMY_MODE: autonomyParam,
        ...(msgId ? { VF_MSG_ID: msgId } : {}),
        ...(sandboxConfig.maxBudgetUsd ? { VF_MAX_BUDGET_USD: String(sandboxConfig.maxBudgetUsd) } : {}),
      },
    });

    // KV write is non-blocking — doesn't gate WS setup
    env.SESSIONS_KV.put(
      `message:${sessionId}:${userMsgId}`,
      JSON.stringify(userMessage),
      { expirationTtl: 7 * 24 * 60 * 60 }
    ).catch(() => {});

    const t3 = Date.now();
    console.log(`[sdk/ws] Phase 3 (setup): ${t3 - t2}ms`);
    console.log(`[sdk/ws] Total pre-WS: ${t3 - t0}ms`);

    // Proxy the WebSocket connection to the container
    return sandboxManager.wsConnectToSandbox(session.sandboxId!, request);
  } catch (err) {
    console.error(`[sdk/ws] FAILED after ${Date.now() - t0}ms:`, err instanceof Error ? err.message : String(err));
    return new Response('WebSocket setup failed', { status: 500 });
  }
}
