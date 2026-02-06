import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Session, ApiResponse } from '../types';

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
    const session = await sandboxManager.createSandbox(sessionId, user.id, {
      gitRepo: parsed.data.gitRepo,
      branch: parsed.data.branch,
      env: {
        // Set ANTHROPIC_API_KEY for Claude Code CLI auth
        ANTHROPIC_API_KEY: user.claudeToken || '',
      },
    });

    // Write Claude Code credentials file for OAuth token support
    // This handles sk-ant-oat01- tokens that need credential file auth
    if (user.claudeToken) {
      try {
        const homeResult = await sandboxManager.execInSandbox(
          sessionId, 'echo $HOME', { timeout: 5000 }
        );
        const home = homeResult.stdout?.trim() || '/root';
        await sandboxManager.mkdir(sessionId, `${home}/.claude`);
        const credJson = JSON.stringify({
          claudeAiOauth: { token: user.claudeToken },
        });
        await sandboxManager.writeFile(
          sessionId,
          `${home}/.claude/.credentials.json`,
          credJson
        );
      } catch {
        // Non-fatal: env var may be sufficient for API key tokens
      }
    }

    // Store session metadata
    if (parsed.data.name) {
      session.metadata = { name: parsed.data.name };
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

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['sh', '-c', body.command],
    {
      cwd: body.cwd,
      timeout: body.timeout,
    }
  );

  return c.json<ApiResponse<typeof result>>({
    success: true,
    data: result,
  });
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
    session.metadata = { ...session.metadata, name: body.name };
  }
  if (body.metadata !== undefined) {
    session.metadata = { ...session.metadata, ...body.metadata };
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
