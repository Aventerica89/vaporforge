import { z } from 'zod';

/**
 * Validates that a string is a valid base64 data URL
 * Prevents external URLs from being injected as screenshot data
 */
const dataUrlSchema = z.string().refine(
  (value) => {
    // Must start with data: protocol
    if (!value.startsWith('data:')) {
      return false;
    }

    // Extract the media type and encoding
    const match = value.match(/^data:([^;,]+)(;base64)?,/);
    if (!match) {
      return false;
    }

    // Verify it has base64 encoding for images
    const mediaType = match[1];
    const isBase64 = match[2] === ';base64';

    // Allow only image types with base64 encoding
    return mediaType.startsWith('image/') && isBase64;
  },
  {
    message: 'Invalid data URL: must be a base64-encoded image',
  }
);

/**
 * Schema for screenshot validation
 */
export const issueScreenshotSchema = z.object({
  id: z.string().uuid(),
  dataUrl: dataUrlSchema,
  fileUrl: z.string().url().optional(),
});

/**
 * Schema for issue validation
 */
export const issueSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  type: z.enum(['bug', 'error', 'feature', 'suggestion']),
  size: z.enum(['S', 'M', 'L']),
  screenshots: z.array(issueScreenshotSchema),
  claudeNote: z.string().max(2000).optional(),
  resolved: z.boolean(),
  createdAt: z.string().datetime(),
});

/**
 * Schema for the full tracker export
 */
export const trackerExportSchema = z.object({
  issues: z.array(issueSchema),
  suggestions: z.string().max(10000),
  filter: z.enum(['all', 'bug', 'error', 'feature', 'suggestion', 'resolved']),
  exportedAt: z.string().datetime(),
});

/**
 * Type-safe validation helper
 */
export function validateImportData(data: unknown): {
  success: boolean;
  data?: z.infer<typeof trackerExportSchema>;
  errors?: string[];
} {
  try {
    const parsed = trackerExportSchema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return {
      success: false,
      errors: ['Unknown validation error'],
    };
  }
}
