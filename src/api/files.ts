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

// Upload base64-encoded binary file (images, etc.)
const UploadBase64Schema = z.object({
  filename: z.string().min(1),
  data: z.string().min(1), // raw base64 (no data URI prefix)
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

fileRoutes.post('/upload-base64/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  const body = await c.req.json();
  const parsed = UploadBase64Schema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  // Strip data URI prefix if present (e.g. "data:image/png;base64,")
  const rawBase64 = parsed.data.data.replace(/^data:[^;]+;base64,/, '');

  // Validate size (base64 is ~4/3 of binary size)
  const estimatedBytes = (rawBase64.length * 3) / 4;
  if (estimatedBytes > MAX_UPLOAD_BYTES) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'File exceeds 10MB limit',
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

  const uploadDir = '/workspace/.vaporforge/uploads';
  const filePath = `${uploadDir}/${parsed.data.filename}`;

  // Create directory + write binary via base64 decode
  const mkdirResult = await sandboxManager.execInSandbox(
    session.sandboxId,
    ['mkdir', '-p', uploadDir]
  );

  if (mkdirResult.exitCode !== 0) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to create upload directory',
    }, 500);
  }

  // Write base64 data in small chunks via exec to avoid crashing the sandbox.
  // sandbox.writeFile() sends the entire payload in one DO RPC call,
  // which kills the container for large files (images ~1-5MB).
  // Even 128KB exec commands can crash it — use 8KB chunks to be safe.
  // Base64 chars [A-Za-z0-9+/=] are safe inside single-quoted bash strings.
  const CHUNK_SIZE = 8 * 1024; // 8KB per chunk (conservative for DO RPC)
  const tmpPath = `/tmp/vf-upload-${Date.now()}.b64`;
  const totalChunks = Math.ceil(rawBase64.length / CHUNK_SIZE);

  console.log(`[upload-base64] ${sessionId.slice(0, 8)}: writing ${rawBase64.length} bytes in ${totalChunks} chunks`);

  try {
    for (let i = 0; i < rawBase64.length; i += CHUNK_SIZE) {
      const chunk = rawBase64.slice(i, i + CHUNK_SIZE);
      const op = i === 0 ? '>' : '>>';
      const chunkResult = await sandboxManager.execInSandbox(
        session.sandboxId,
        `printf '%s' '${chunk}' ${op} ${tmpPath}`,
        { timeout: 15000 }
      );
      if (chunkResult.exitCode !== 0) {
        console.error(`[upload-base64] chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${totalChunks} FAILED: ${chunkResult.stderr}`);
        return c.json<ApiResponse<never>>({
          success: false,
          error: 'Failed to stage upload data',
        }, 500);
      }
    }

    console.log(`[upload-base64] ${sessionId.slice(0, 8)}: all ${totalChunks} chunks written, decoding...`);

    // Decode base64 temp file to binary using base64 CLI tool.
    // Previous approach used node -e with inline JS, but execInSandbox
    // joins array args with spaces — bash interprets semicolons as
    // command separators, crashing the shell (exit code 2).
    const writeResult = await sandboxManager.execInSandbox(
      session.sandboxId,
      `base64 -d < ${tmpPath} > '${filePath}' && rm -f ${tmpPath}`,
      { timeout: 30000 }
    );

    if (writeResult.exitCode !== 0) {
      console.error(`[upload-base64] decode FAILED: ${writeResult.stderr}`);
      return c.json<ApiResponse<never>>({
        success: false,
        error: writeResult.stderr || 'Failed to write file',
      }, 500);
    }

    console.log(`[upload-base64] ${sessionId.slice(0, 8)}: success → ${filePath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[upload-base64] EXCEPTION: ${msg}`);
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Upload failed: ${msg}`,
    }, 500);
  }

  return c.json<ApiResponse<{ path: string }>>({
    success: true,
    data: { path: filePath },
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
