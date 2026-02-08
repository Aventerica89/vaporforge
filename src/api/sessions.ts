import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Session, ApiResponse } from '../types';
import { collectProjectSecrets, collectUserSecrets } from '../sandbox';

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const sessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const CreateSessionSchema = z.object({
  name: z.string().optional(),
  gitRepo: z.string().url().optional(),
  branch: z.string().optional(),
});

// Create new session
sessionRoutes.post('/create', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');

  const body = await c.req.json();
  const parsed = CreateSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  const sessionId = crypto.randomUUID();

  try {
    // Create sandbox with Claude token injected as persistent env var
    // This makes `claude` CLI work in both chat and terminal
    const claudeToken = user.claudeToken;
    if (!claudeToken) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'No Claude token available. Please re-authenticate.',
      }, 401);
    }

    // SECURITY: Only accept OAuth tokens (MANDATORY per CLAUDE.md)
    if (!claudeToken.startsWith('sk-ant-oat01-')) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Only Claude OAuth tokens accepted. Run `claude setup-token` to obtain one.',
      }, 403);
    }

    const sandboxEnv: Record<string, string> = {
      CLAUDE_CODE_OAUTH_TOKEN: claudeToken,
      ...collectProjectSecrets(c.env),
      ...await collectUserSecrets(c.env.SESSIONS_KV, user.id),
    };

    // Fetch user's global CLAUDE.md for injection into sandbox
    const claudeMd = await c.env.SESSIONS_KV.get(
      `user-config:${user.id}:claude-md`
    );

    const session = await sandboxManager.createSandbox(sessionId, user.id, {
      gitRepo: parsed.data.gitRepo,
      branch: parsed.data.branch,
      env: sandboxEnv,
      claudeMd: claudeMd || undefined,
    });

    // Persist session name to KV (createSandbox already saved without it)
    if (parsed.data.name) {
      session.metadata = { ...(session.metadata ?? {}), name: parsed.data.name };
      await c.env.SESSIONS_KV.put(
        `session:${sessionId}`,
        JSON.stringify(session)
      );
    }

    return c.json<ApiResponse<Session>>({
      success: true,
      data: session,
    });
  } catch (error) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
    }, 500);
  }
});

// List user sessions
sessionRoutes.get('/list', async (c) => {
  const user = c.get('user');

  // List sessions for user
  const prefix = `session:`;
  const sessions: Session[] = [];

  const list = await c.env.SESSIONS_KV.list({ prefix });

  for (const key of list.keys) {
    const session = await c.env.SESSIONS_KV.get<Session>(key.name, 'json');
    if (session && session.userId === user.id) {
      sessions.push(session);
    }
  }

  // Sort by last active
  sessions.sort((a, b) =>
    new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );

  return c.json<ApiResponse<Session[]>>({
    success: true,
    data: sessions,
    meta: {
      total: sessions.length,
    },
  });
});

// Get session details
sessionRoutes.get('/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  return c.json<ApiResponse<Session>>({
    success: true,
    data: session,
  });
});

// Resume session (wake if sleeping)
sessionRoutes.post('/:sessionId/resume', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  return c.json<ApiResponse<Session>>({
    success: true,
    data: session,
  });
});

// Sleep session (backup and release resources)
sessionRoutes.post('/:sessionId/sleep', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  // Verify ownership
  const session = await c.env.SESSIONS_KV.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  await sandboxManager.sleepSandbox(sessionId);

  return c.json<ApiResponse<{ status: string }>>({
    success: true,
    data: { status: 'sleeping' },
  });
});

// Terminate session
sessionRoutes.delete('/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  // Verify ownership
  const session = await c.env.SESSIONS_KV.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  await sandboxManager.terminateSandbox(sessionId);

  // Delete from KV
  await c.env.SESSIONS_KV.delete(`session:${sessionId}`);

  return c.json<ApiResponse<{ status: string }>>({
    success: true,
    data: { status: 'terminated' },
  });
});

// Execute command in session
sessionRoutes.post('/:sessionId/exec', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    command: string;
    cwd?: string;
    timeout?: number;
  }>();

  if (!body.command) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Command is required',
    }, 400);
  }

  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  // Inject Claude token + NODE_PATH + project secrets + user secrets
  const execEnv: Record<string, string> = {
    NODE_PATH: '/usr/local/lib/node_modules',
    ...collectProjectSecrets(c.env),
    ...await collectUserSecrets(c.env.SESSIONS_KV, user.id),
  };
  const claudeToken = user.claudeToken;
  if (claudeToken) {
    execEnv.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;
  }

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['sh', '-c', body.command],
    {
      cwd: body.cwd,
      env: execEnv,
      timeout: body.timeout || 300000,
    }
  );

  return c.json<ApiResponse<typeof result>>({
    success: true,
    data: result,
  });
});

// Execute command with SSE streaming output (for long-running commands like claude)
sessionRoutes.post('/:sessionId/exec-stream', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    command: string;
    cwd?: string;
    timeout?: number;
  }>();

  if (!body.command) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Command is required',
    }, 400);
  }

  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  // Inject Claude token + NODE_PATH + project secrets + user secrets
  const streamEnv: Record<string, string> = {
    NODE_PATH: '/usr/local/lib/node_modules',
    ...collectProjectSecrets(c.env),
    ...await collectUserSecrets(c.env.SESSIONS_KV, user.id),
  };
  const claudeToken = user.claudeToken;
  if (claudeToken) {
    streamEnv.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;
  }

  try {
    // Get streaming output from sandbox
    const stream = await sandboxManager.execStreamInSandbox(
      session.sandboxId,
      body.command,
      {
        cwd: body.cwd || session.projectPath || '/workspace',
        env: streamEnv,
        timeout: body.timeout || 300000,
      }
    );

    // Pipe the sandbox SSE stream, re-wrapping events for our frontend
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    c.executionCtx.waitUntil((async () => {
      const reader = stream.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            try {
              const event = JSON.parse(data) as {
                type: string;
                data?: string;
                exitCode?: number;
                error?: string;
              };

              if (event.type === 'stdout' && event.data) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'stdout', content: event.data })}\n\n`
                  )
                );
              } else if (event.type === 'stderr' && event.data) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'stderr', content: event.data })}\n\n`
                  )
                );
              } else if (event.type === 'complete') {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'complete', exitCode: event.exitCode ?? 0 })}\n\n`
                  )
                );
              } else if (event.type === 'error') {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'error', content: event.error || 'Unknown error' })}\n\n`
                  )
                );
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Stream error';
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`
          )
        );
      } finally {
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
      error: error instanceof Error ? error.message : 'Failed to start streaming exec',
    }, 500);
  }
});

// Clone repository into session
sessionRoutes.post('/:sessionId/clone', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    repo: string;
    branch?: string;
    path?: string;
  }>();

  if (!body.repo) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Repository URL is required',
    }, 400);
  }

  const session = await sandboxManager.getOrWakeSandbox(sessionId);

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  const targetPath = body.path || '/workspace';

  // Clone repository
  const cloneResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', 'clone', body.repo, targetPath],
    { timeout: 60000 }
  );

  if (cloneResult.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: cloneResult.stderr || 'Failed to clone repository',
    }, 500);
  }

  // Checkout branch if specified
  if (body.branch) {
    const checkoutResult = await sandboxManager.execInSandbox(
      session.sandboxId,
      ['git', '-C', targetPath, 'checkout', body.branch]
    );

    if (checkoutResult.exitCode !== 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: checkoutResult.stderr || 'Failed to checkout branch',
      }, 500);
    }
  }

  // Update session with repo info
  session.gitRepo = body.repo;
  session.projectPath = targetPath;
  await c.env.SESSIONS_KV.put(
    `session:${sessionId}`,
    JSON.stringify(session)
  );

  return c.json<ApiResponse<{ repo: string; path: string }>>({
    success: true,
    data: {
      repo: body.repo,
      path: targetPath,
    },
  });
});

// Debug: get termination error for a session
sessionRoutes.get('/debug/error/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const session = await c.env.SESSIONS_KV.get<Session>(
    `session:${sessionId}`, 'json'
  );
  if (!session) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  // SECURITY: Verify session belongs to user (fix IDOR vulnerability)
  if (session.userId !== user.id) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  return c.json({
    success: true,
    data: {
      id: session.id,
      status: session.status,
      metadata: session.metadata ?? {},
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
    },
  });
});

// Debug: test sandbox operations step-by-step
sessionRoutes.post('/debug/sandbox', async (c) => {
  const sandboxManager = c.get('sandboxManager');
  const debugId = `debug-${crypto.randomUUID().slice(0, 8)}`;
  const steps: Array<{ step: string; ok: boolean; ms: number; detail?: string }> = [];

  const runStep = async (name: string, fn: () => Promise<string | void>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      steps.push({ step: name, ok: true, ms: Date.now() - t0, detail: detail || 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ step: name, ok: false, ms: Date.now() - t0, detail: msg });
    }
  };

  // Step 1: Can we create a sandbox at all?
  await runStep('createSandbox', async () => {
    const session = await sandboxManager.createSandbox(debugId, 'debug-user');
    return `status=${session.status}`;
  });

  // Only continue if sandbox created
  if (steps[0]?.ok) {
    // Step 2: Can we exec a simple command?
    await runStep('exec: whoami', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'whoami', { timeout: 10000 });
      if (r.exitCode !== 0) throw new Error(`exit=${r.exitCode} stderr=${r.stderr}`);
      return r.stdout.trim();
    });

    // Step 3: Can we exec echo?
    await runStep('exec: echo hello', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'echo hello', { timeout: 10000 });
      if (r.exitCode !== 0) throw new Error(`exit=${r.exitCode} stderr=${r.stderr}`);
      return r.stdout.trim();
    });

    // Step 4: Is claude CLI available?
    await runStep('exec: which claude', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'which claude', { timeout: 10000 });
      if (r.exitCode !== 0) throw new Error(`not found: stderr=${r.stderr}`);
      return r.stdout.trim();
    });

    // Step 5: Check claude --help
    await runStep('exec: claude --help (first 200 chars)', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'claude --help 2>&1 | head -20', { timeout: 15000 });
      return (r.stdout || r.stderr).trim().slice(0, 200);
    });

    // Step 6: Can we write a file?
    await runStep('writeFile: /tmp/test.txt', async () => {
      const ok = await sandboxManager.writeFile(debugId, '/tmp/test.txt', 'hello');
      if (!ok) throw new Error('writeFile returned false');
      return 'written';
    });

    // Step 7: Can we read it back?
    await runStep('readFile: /tmp/test.txt', async () => {
      const content = await sandboxManager.readFile(debugId, '/tmp/test.txt');
      if (!content) throw new Error('readFile returned null');
      return content;
    });

    // Step 8: Check env vars
    await runStep('exec: env | grep -i claude', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'env | grep -i -E "claude|anthropic" || echo "none found"', { timeout: 10000 });
      return (r.stdout || 'empty').trim().slice(0, 200);
    });

    // Step 9: Check home directory
    await runStep('exec: echo $HOME', async () => {
      const r = await sandboxManager.execInSandbox(debugId, 'echo $HOME', { timeout: 5000 });
      return r.stdout.trim();
    });

    // Step 10: Can we execStream? (this is the failing code path)
    await runStep('execStream: echo streaming', async () => {
      const stream = await sandboxManager.execStreamInSandbox(
        debugId,
        'echo streaming-test-ok',
        { timeout: 15000 }
      );
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
      }
      return output.slice(0, 300);
    });

  }

  // Always cleanup debug session KV key (even if createSandbox failed)
  try {
    await c.env.SESSIONS_KV.delete(`session:${debugId}`);
  } catch { /* ignore */ }

  return c.json({
    success: true,
    data: {
      sandboxId: debugId,
      steps,
      summary: {
        total: steps.length,
        passed: steps.filter(s => s.ok).length,
        failed: steps.filter(s => !s.ok).length,
      },
    },
  });
});

// Update session metadata
sessionRoutes.patch('/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    name?: string;
    metadata?: Record<string, unknown>;
  }>();

  const session = await c.env.SESSIONS_KV.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  // Update fields
  if (body.name !== undefined) {
    session.metadata = { ...(session.metadata ?? {}), name: body.name };
  }
  if (body.metadata !== undefined) {
    session.metadata = { ...(session.metadata ?? {}), ...body.metadata };
  }

  await c.env.SESSIONS_KV.put(
    `session:${sessionId}`,
    JSON.stringify(session)
  );

  return c.json<ApiResponse<Session>>({
    success: true,
    data: session,
  });
});
