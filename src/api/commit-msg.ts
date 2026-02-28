import { Hono } from 'hono';
import { z } from 'zod';
import { generateText, Output } from 'ai';
import type { User, ApiResponse } from '../types';
import {
  createModel,
  getProviderCredentials,
  type ProviderName,
} from '../services/ai-provider-factory';
import { CommitMessageSchema, type CommitMessage } from '../services/ai-schemas';

type Variables = { user: User };

export const commitMsgRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/* ── Schema ─────────────────────────────────── */

const CommitMsgRequestSchema = z.object({
  diff: z.string().min(1).max(200_000),
  stagedFiles: z.array(z.string()).max(500),
  provider: z.enum(['claude', 'gemini', 'openai']),
  model: z.string().max(50).optional(),
});

/* ── System prompt ──────────────────────────── */

const SYSTEM_PROMPT = [
  'You are a commit message generator.',
  'Analyze the git diff and generate a conventional commit message.',
  'Use the conventional commits format: type(scope): subject.',
  'The subject should be imperative, lowercase, no period at the end.',
  'Only set breaking to true if the change breaks backward compatibility.',
  'Keep the subject under 72 characters.',
  'Only add a body if the change needs explanation beyond the subject.',
].join(' ');

/* ── Route ──────────────────────────────────── */

commitMsgRoutes.post('/generate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = CommitMsgRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid input',
      },
      400
    );
  }

  const { diff, stagedFiles, provider, model: modelAlias } = parsed.data;

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

  const userMessage = [
    `Staged files: ${stagedFiles.join(', ')}`,
    '',
    'Diff:',
    '```',
    diff.slice(0, 50_000),
    '```',
  ].join('\n');

  try {
    const result = await generateText({
      model: aiModel,
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      output: Output.object({ schema: CommitMessageSchema }),
    });

    if (!result.output) {
      return c.json<ApiResponse<never>>(
        { success: false, error: 'Failed to parse commit message' },
        500
      );
    }

    return c.json<ApiResponse<CommitMessage>>({
      success: true,
      data: result.output,
    });
  } catch (err) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Commit message generation failed',
      },
      500
    );
  }
});
