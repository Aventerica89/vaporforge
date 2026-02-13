import { Hono } from 'hono';
import { z } from 'zod';
import { FileService } from '../services/files';
import type { User, ApiResponse } from '../types';

type Variables = {
  user: User;
};

export const vaporFilesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const UploadBase64Schema = z.object({
  dataUrl: z.string().min(1),
  name: z.string().optional(),
});

const UploadBinarySchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Upload base64-encoded file (for screenshots, images)
vaporFilesRoutes.post('/upload-base64', async (c) => {
  const user = c.get('user');
  const fileService = new FileService(
    c.env.FILES_BUCKET,
    `https://${new URL(c.req.url).host}`
  );

  const body = await c.req.json();
  const parsed = UploadBase64Schema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  // Extract and validate size
  const [, base64Data] = parsed.data.dataUrl.split(',');
  const estimatedBytes = (base64Data.length * 3) / 4;

  if (estimatedBytes > MAX_FILE_SIZE) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    }, 400);
  }

  try {
    const result = await fileService.uploadBase64(
      parsed.data.dataUrl,
      user.id,
      parsed.data.name
    );

    return c.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json<ApiResponse<never>>({
      success: false,
      error: message,
    }, 500);
  }
});

// Upload binary file
vaporFilesRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const fileService = new FileService(
    c.env.FILES_BUCKET,
    `https://${new URL(c.req.url).host}`
  );

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const name = (formData.get('name') as string) || file?.name;

  if (!file) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'No file provided',
    }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await fileService.uploadFile(
      arrayBuffer,
      file.type,
      user.id,
      name
    );

    return c.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json<ApiResponse<never>>({
      success: false,
      error: message,
    }, 500);
  }
});

// List user files
vaporFilesRoutes.get('/list', async (c) => {
  const user = c.get('user');
  const fileService = new FileService(
    c.env.FILES_BUCKET,
    `https://${new URL(c.req.url).host}`
  );

  try {
    const files = await fileService.listUserFiles(user.id);

    return c.json<ApiResponse<typeof files>>({
      success: true,
      data: files,
      meta: {
        total: files.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list files';
    return c.json<ApiResponse<never>>({
      success: false,
      error: message,
    }, 500);
  }
});

// Delete file
vaporFilesRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const fileService = new FileService(
    c.env.FILES_BUCKET,
    `https://${new URL(c.req.url).host}`
  );
  const fileId = c.req.param('id');

  try {
    // Verify ownership by listing user files
    const userFiles = await fileService.listUserFiles(user.id);
    const file = userFiles.find(f => fileId.startsWith(f.id));

    if (!file) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'File not found or unauthorized',
      }, 404);
    }

    await fileService.deleteFile(fileId);

    return c.json<ApiResponse<{ id: string }>>({
      success: true,
      data: { id: fileId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return c.json<ApiResponse<never>>({
      success: false,
      error: message,
    }, 500);
  }
});
