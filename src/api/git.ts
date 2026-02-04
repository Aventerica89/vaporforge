import { Hono } from 'hono';
import { z } from 'zod';
import type { User, GitStatus, GitCommit, ApiResponse } from '../types';

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const gitRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Get git status
gitRoutes.get('/status/:sessionId', async (c) => {
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

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  const cwd = session.projectPath || '/workspace';

  // Get branch
  const branchResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'branch', '--show-current']
  );

  // Get ahead/behind
  const trackingResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'rev-list', '--left-right', '--count', '@{u}...HEAD']
  );

  let ahead = 0;
  let behind = 0;
  if (trackingResult.exitCode === 0) {
    const [behindStr, aheadStr] = trackingResult.stdout.trim().split('\t');
    behind = parseInt(behindStr, 10) || 0;
    ahead = parseInt(aheadStr, 10) || 0;
  }

  // Get staged files
  const stagedResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'diff', '--cached', '--name-only']
  );

  // Get modified files
  const modifiedResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'diff', '--name-only']
  );

  // Get untracked files
  const untrackedResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'ls-files', '--others', '--exclude-standard']
  );

  const status: GitStatus = {
    branch: branchResult.stdout.trim() || 'main',
    ahead,
    behind,
    staged: stagedResult.stdout.split('\n').filter(Boolean),
    modified: modifiedResult.stdout.split('\n').filter(Boolean),
    untracked: untrackedResult.stdout.split('\n').filter(Boolean),
  };

  return c.json<ApiResponse<GitStatus>>({
    success: true,
    data: status,
  });
});

// Get commit history
gitRoutes.get('/log/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const limit = parseInt(c.req.query('limit') || '20', 10);

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

  const cwd = session.projectPath || '/workspace';

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    [
      'git', '-C', cwd, 'log',
      `--max-count=${limit}`,
      '--format=%H|%s|%an|%aI',
    ]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to get log',
    }, 500);
  }

  const commits: GitCommit[] = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, message, author, date };
    });

  return c.json<ApiResponse<GitCommit[]>>({
    success: true,
    data: commits,
    meta: {
      total: commits.length,
    },
  });
});

// Get diff
gitRoutes.get('/diff/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const file = c.req.query('file');
  const staged = c.req.query('staged') === 'true';

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

  const cwd = session.projectPath || '/workspace';

  const args = ['git', '-C', cwd, 'diff'];
  if (staged) args.push('--cached');
  if (file) args.push('--', file);

  const result = await sandboxManager.execInSandbox(session.sandboxId, args);

  return c.json<ApiResponse<{ diff: string }>>({
    success: true,
    data: { diff: result.stdout },
  });
});

const StageSchema = z.object({
  files: z.array(z.string()).min(1),
});

// Stage files
gitRoutes.post('/stage/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json();
  const parsed = StageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
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

  const cwd = session.projectPath || '/workspace';

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'add', ...parsed.data.files]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to stage files',
    }, 500);
  }

  return c.json<ApiResponse<{ staged: string[] }>>({
    success: true,
    data: { staged: parsed.data.files },
  });
});

// Unstage files
gitRoutes.post('/unstage/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json();
  const parsed = StageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
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

  const cwd = session.projectPath || '/workspace';

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'reset', 'HEAD', '--', ...parsed.data.files]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to unstage files',
    }, 500);
  }

  return c.json<ApiResponse<{ unstaged: string[] }>>({
    success: true,
    data: { unstaged: parsed.data.files },
  });
});

const CommitSchema = z.object({
  message: z.string().min(1).max(5000),
});

// Create commit
gitRoutes.post('/commit/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json();
  const parsed = CommitSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
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

  const cwd = session.projectPath || '/workspace';

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'commit', '-m', parsed.data.message]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to commit',
    }, 500);
  }

  // Get the commit hash
  const hashResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'rev-parse', 'HEAD']
  );

  return c.json<ApiResponse<{ hash: string; message: string }>>({
    success: true,
    data: {
      hash: hashResult.stdout.trim(),
      message: parsed.data.message,
    },
  });
});

// Push to remote
gitRoutes.post('/push/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    remote?: string;
    branch?: string;
    force?: boolean;
  }>();

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

  const cwd = session.projectPath || '/workspace';

  const args = ['git', '-C', cwd, 'push'];
  if (body.force) args.push('--force');
  if (body.remote) args.push(body.remote);
  if (body.branch) args.push(body.branch);

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    args,
    { timeout: 60000 }
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to push',
    }, 500);
  }

  return c.json<ApiResponse<{ success: boolean }>>({
    success: true,
    data: { success: true },
  });
});

// Pull from remote
gitRoutes.post('/pull/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    remote?: string;
    branch?: string;
    rebase?: boolean;
  }>();

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

  const cwd = session.projectPath || '/workspace';

  const args = ['git', '-C', cwd, 'pull'];
  if (body.rebase) args.push('--rebase');
  if (body.remote) args.push(body.remote);
  if (body.branch) args.push(body.branch);

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    args,
    { timeout: 60000 }
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to pull',
    }, 500);
  }

  return c.json<ApiResponse<{ output: string }>>({
    success: true,
    data: { output: result.stdout },
  });
});

// Get branches
gitRoutes.get('/branches/:sessionId', async (c) => {
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

  if (!session.sandboxId) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Sandbox not active',
    }, 400);
  }

  const cwd = session.projectPath || '/workspace';

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', cwd, 'branch', '-a', '--format=%(refname:short)|%(upstream:short)|%(HEAD)']
  );

  const branches = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [name, upstream, isCurrent] = line.split('|');
      return {
        name,
        upstream: upstream || null,
        current: isCurrent === '*',
      };
    });

  return c.json<ApiResponse<typeof branches>>({
    success: true,
    data: branches,
  });
});

// Checkout branch
gitRoutes.post('/checkout/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{
    branch: string;
    create?: boolean;
  }>();

  if (!body.branch) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Branch name is required',
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

  const cwd = session.projectPath || '/workspace';

  const args = ['git', '-C', cwd, 'checkout'];
  if (body.create) args.push('-b');
  args.push(body.branch);

  const result = await sandboxManager.execInSandbox(session.sandboxId, args);

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to checkout branch',
    }, 500);
  }

  return c.json<ApiResponse<{ branch: string }>>({
    success: true,
    data: { branch: body.branch },
  });
});
