import { nanoid } from 'nanoid';

export interface FileMetadata {
  id: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
  userId: string;
  uploadedAt: string;
}

export interface UploadResult {
  id: string;
  url: string;
  metadata: FileMetadata;
}

export class FileService {
  constructor(
    private bucket: R2Bucket,
    private baseUrl: string
  ) {}

  /**
   * Upload a file to R2 storage
   */
  async uploadFile(
    file: ArrayBuffer,
    mimeType: string,
    userId: string,
    originalName?: string
  ): Promise<UploadResult> {
    const id = nanoid(12);
    const extension = this.getExtensionFromMimeType(mimeType);
    const key = `${id}${extension}`;

    const metadata: FileMetadata = {
      id,
      key,
      name: originalName || `file${extension}`,
      mimeType,
      size: file.byteLength,
      userId,
      uploadedAt: new Date().toISOString(),
    };

    await this.bucket.put(key, file, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        userId,
        originalName: metadata.name,
        uploadedAt: metadata.uploadedAt,
      },
    });

    return {
      id,
      url: `${this.baseUrl}/files/${key}`,
      metadata,
    };
  }

  /**
   * Upload base64-encoded data (for screenshots)
   */
  async uploadBase64(
    dataUrl: string,
    userId: string,
    name?: string
  ): Promise<UploadResult> {
    const [mimePrefix, base64Data] = dataUrl.split(',');
    const mimeType = mimePrefix.match(/data:([^;]+)/)?.[1] || 'image/png';

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return this.uploadFile(bytes.buffer, mimeType, userId, name);
  }

  /**
   * Get a file from R2 storage
   */
  async getFile(key: string): Promise<R2ObjectBody | null> {
    return await this.bucket.get(key);
  }

  /**
   * Delete a file from R2 storage
   */
  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * List files for a user.
   * Must pass include to get metadata (compat_date >= 2022-08-04).
   * Paginates through all objects since R2 list() caps at 1000.
   */
  async listUserFiles(userId: string): Promise<FileMetadata[]> {
    const files: FileMetadata[] = [];
    let cursor: string | undefined;

    do {
      const listed = await this.bucket.list({
        include: ['customMetadata', 'httpMetadata'],
        cursor,
      });

      for (const object of listed.objects) {
        if (object.customMetadata?.userId === userId) {
          const id = object.key.split('.')[0];
          files.push({
            id,
            key: object.key,
            name: object.customMetadata.originalName || object.key,
            mimeType: object.httpMetadata?.contentType || 'application/octet-stream',
            size: object.size,
            userId,
            uploadedAt: object.customMetadata.uploadedAt || object.uploaded.toISOString(),
          });
        }
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return files.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/json': '.json',
    };
    return map[mimeType] || '';
  }
}
