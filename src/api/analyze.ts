import { Hono } from 'hono';
import { z } from 'zod';
import { streamText, Output } from 'ai';
import type { User, ApiResponse } from '../types';
import {
  createModel,
  getProviderCredentials,
  type ProviderName,
} from '../services/ai-provider-factory';
import { CodeAnalysisSchema } from '../services/ai-schemas';

type Variables = { user: User };

export const analyzeRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/* ── Schema ─────────────────────────────────── */

const AnalyzeRequestSchema = z.object({
  code: z.string().min(1).max(100_000),
  language: z.string().max(50).default('plaintext'),
  filePath: z.string().max(500).optional(),
  provider: z.enum(['claude', 'gemini', 'openai']),
  model: z.string().max(50).optional(),
});

/* ── SSE helper ─────────────────────────────── */

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/* ── System prompt ──────────────────────────── */

function buildSystemPrompt(language: string, filePath?: string): string {
  const parts = [
    'You are a code analysis assistant.',
    'Analyze the provided code and return a structured assessment.',
    'Be specific about line numbers for issues when possible.',
    'Rate complexity from 1 (trivial) to 10 (extremely complex).',
    `Language: ${language}.`,
  ];
  if (filePath) {
    parts.push(`File: ${filePath}.`);
  }
  return parts.join(' ');
}

/* ── Route ──────────────────────────────────── */

analyzeRoutes.post('/structured', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid input',
      },
      400
    );
  }

  const { code, language, filePath, provider, model: modelAlias } =
    parsed.data;

  const creds = await getProviderCredentials(c.env.SESSIONS_KV, user.id, user.claudeToken);

  let aiModel;
  try {
    aiModel = createModel(provider as ProviderName, creds, modelAlias);
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
    'Analyze the following code:',
    '',
    '```',
    code,
    '```',
  ].join('\n');

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
        output: Output.object({ schema: CodeAnalysisSchema }),
      });

      for await (const partial of result.partialOutputStream) {
        await write({ type: 'partial', data: partial });
      }

      const final = await result.output;
      await write({ type: 'done', data: final });
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Analysis error';
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
