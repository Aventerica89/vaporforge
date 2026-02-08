import { Hono } from 'hono';
import { z } from 'zod';
import type { User, FileInfo, ApiResponse } from '../types';

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const fileRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// List files in directory
fileRoutes.get('/list/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') || '/workspace';

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

  const files = await sandboxManager.listFiles(session.sandboxId, path);

  return c.json<ApiResponse<FileInfo[]>>({
    success: true,
    data: files,
    meta: {
      total: files.length,
    },
  });
});

// Read file content
fileRoutes.get('/read/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path');

  if (!path) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Path is required',
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

  const content = await sandboxManager.readFile(session.sandboxId, path);

  if (content === null) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'File not found',
    }, 404);
  }

  return c.json<ApiResponse<{ path: string; content: string }>>({
    success: true,
    data: { path, content },
  });
});

const WriteFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

// Write file content
fileRoutes.post('/write/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json();
  const parsed = WriteFileSchema.safeParse(body);

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

  const success = await sandboxManager.writeFile(
    session.sandboxId,
    parsed.data.path,
    parsed.data.content
  );

  if (!success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to write file',
    }, 500);
  }

  return c.json<ApiResponse<{ path: string }>>({
    success: true,
    data: { path: parsed.data.path },
  });
});

// Delete file
fileRoutes.delete('/delete/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path');

  if (!path) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Path is required',
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
    ['rm', '-rf', path]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to delete',
    }, 500);
  }

  return c.json<ApiResponse<{ path: string }>>({
    success: true,
    data: { path },
  });
});

// Create directory
fileRoutes.post('/mkdir/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{ path: string }>();

  if (!body.path) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Path is required',
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
    ['mkdir', '-p', body.path]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to create directory',
    }, 500);
  }

  return c.json<ApiResponse<{ path: string }>>({
    success: true,
    data: { path: body.path },
  });
});

// Move/rename file
fileRoutes.post('/move/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{ from: string; to: string }>();

  if (!body.from || !body.to) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'from and to paths are required',
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
    ['mv', body.from, body.to]
  );

  if (result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: result.stderr || 'Failed to move file',
    }, 500);
  }

  return c.json<ApiResponse<{ from: string; to: string }>>({
    success: true,
    data: { from: body.from, to: body.to },
  });
});

// Search files
fileRoutes.get('/search/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const query = c.req.query('q');
  const path = c.req.query('path') || '/workspace';
  const type = c.req.query('type') || 'name'; // 'name' or 'content'

  if (!query) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Query is required',
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

  let command: string[];
  if (type === 'content') {
    // Search file contents with grep
    command = ['grep', '-rl', query, path];
  } else {
    // Search file names with find
    command = ['find', path, '-name', `*${query}*`];
  }

  const result = await sandboxManager.execInSandbox(session.sandboxId, command);

  const files = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(f => f.trim());

  return c.json<ApiResponse<string[]>>({
    success: true,
    data: files,
    meta: {
      total: files.length,
    },
  });
});

// Get file diff
fileRoutes.get('/diff/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path');

  if (!path) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Path is required',
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

  // Get git diff for file
  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['git', '-C', '/workspace', 'diff', path]
  );

  return c.json<ApiResponse<{ path: string; diff: string }>>({
    success: true,
    data: {
      path,
      diff: result.stdout,
    },
  });
});

// Download workspace as tar.gz archive (base64-encoded)
fileRoutes.post('/download-archive/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json<{ path?: string }>().catch(() => ({}));
  const targetPath = (body as { path?: string }).path || '/workspace';

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

  // Step 1: Create tar.gz archive (exclude heavy dirs)
  const tarResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    [
      'tar', '-czf', '/tmp/vf-export.tar.gz',
      '-C', targetPath,
      '--exclude=node_modules', '--exclude=.git',
      '.',
    ],
    { timeout: 60000 }
  );

  if (tarResult.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: tarResult.stderr || 'Failed to create archive',
    }, 500);
  }

  // Step 2: Base64 encode the archive
  const b64Result = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['base64', '-w0', '/tmp/vf-export.tar.gz'],
    { timeout: 60000 }
  );

  if (b64Result.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: b64Result.stderr || 'Failed to encode archive',
    }, 500);
  }

  const dirName = targetPath.split('/').pop() || 'workspace';

  return c.json<ApiResponse<{ archive: string; filename: string }>>({
    success: true,
    data: {
      archive: b64Result.stdout.trim(),
      filename: `${dirName}.tar.gz`,
    },
  });
});
