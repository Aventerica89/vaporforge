import { Hono } from 'hono';
import { z } from 'zod';
import { streamText } from 'ai';
import type { User, ApiResponse } from '../types';
import {
  createModel,
  getProviderCredentials,
  type ProviderName,
} from '../services/ai-provider-factory';

type Variables = { user: User };

export const transformRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/* ── Schema ─────────────────────────────────── */

const TransformRequestSchema = z.object({
  code: z.string().min(1).max(100_000),
  instruction: z.string().min(1).max(10_000),
  language: z.string().max(50).default('plaintext'),
  filePath: z.string().max(500).optional(),
  provider: z.enum(['claude', 'gemini']),
  model: z.string().max(50).optional(),
});

/* ── SSE helper ─────────────────────────────── */

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/* ── System prompt ──────────────────────────── */

function buildSystemPrompt(language: string, filePath?: string): string {
  const parts = [
    'You are a code transformation assistant.',
    'Return ONLY the transformed code. No explanations, no markdown fences, no commentary.',
    'Preserve the original formatting style (indentation, line endings).',
    `Language: ${language}.`,
  ];
  if (filePath) {
    parts.push(`File: ${filePath}.`);
  }
  return parts.join(' ');
}

/* ── Route ──────────────────────────────────── */

// POST /stream — Code transformation SSE stream
transformRoutes.post('/stream', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = TransformRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid input',
      },
      400
    );
  }

  const { code, instruction, language, filePath, provider, model: modelAlias } =
    parsed.data;

  // Get credentials
  const creds = await getProviderCredentials(
    c.env.SESSIONS_KV,
    user.id,
    user.claudeToken
  );

  let aiModel;
  try {
    aiModel = createModel(
      provider as ProviderName,
      creds,
      modelAlias
    );
  } catch (err) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to create AI model',
      },
      400
    );
  }

  const systemPrompt = buildSystemPrompt(language, filePath);

  const userMessage = [
    'Transform the following code according to this instruction:',
    '',
    `Instruction: ${instruction}`,
    '',
    '```',
    code,
    '```',
  ].join('\n');

  // Stream response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (data: Record<string, unknown>) =>
    writer.write(encoder.encode(sseEvent(data)));

  const streamPromise = (async () => {
    try {
      await write({ type: 'connected' });

      const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxOutputTokens: 8192,
      });

      let fullText = '';

      for await (const chunk of result.textStream) {
        fullText += chunk;
        await write({ type: 'text', content: chunk });
      }

      await write({ type: 'done', fullText });
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Transform error';
      await write({ type: 'error', content: errMsg });
    } finally {
      await writer.close();
    }
  })();

  c.executionCtx.waitUntil(streamPromise);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
