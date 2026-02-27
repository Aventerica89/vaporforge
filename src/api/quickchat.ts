import { Hono } from 'hono';
import { z } from 'zod';
import { streamText, tool, stepCountIs } from 'ai';
import type { User, ApiResponse } from '../types';
import type { SandboxManager } from '../sandbox';
import {
  createModel,
  getProviderCredentials,
  getAvailableProviders,
  createEmbeddingModel,
  type ProviderName,
  type ProviderCredentials,
} from '../services/ai-provider-factory';
import { searchEmbeddings } from '../services/embeddings';

type Variables = { user: User; sandboxManager: SandboxManager };

export const quickchatRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/** Max messages to store per quick chat (older get trimmed) */
const MAX_MESSAGES_PER_CHAT = 100;
/** TTL for quick chat messages: 7 days */
const MSG_TTL_SECONDS = 7 * 24 * 60 * 60;

/* ── KV helpers ─────────────────────────────── */

interface QuickChatMeta {
  id: string;
  title: string;
  provider: ProviderName;
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface QuickChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: ProviderName;
  model?: string;
  createdAt: string;
}

function chatListKey(userId: string): string {
  return `quickchat-list:${userId}`;
}

function chatMsgKey(
  userId: string,
  chatId: string
): string {
  return `quickchat-msg:${userId}:${chatId}`;
}

async function readChatList(
  kv: KVNamespace,
  userId: string
): Promise<QuickChatMeta[]> {
  const raw = await kv.get(chatListKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeChatList(
  kv: KVNamespace,
  userId: string,
  list: QuickChatMeta[]
): Promise<void> {
  await kv.put(chatListKey(userId), JSON.stringify(list));
}

async function readMessages(
  kv: KVNamespace,
  userId: string,
  chatId: string
): Promise<QuickChatMessage[]> {
  const raw = await kv.get(chatMsgKey(userId, chatId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeMessages(
  kv: KVNamespace,
  userId: string,
  chatId: string,
  messages: QuickChatMessage[]
): Promise<void> {
  const trimmed =
    messages.length > MAX_MESSAGES_PER_CHAT
      ? messages.slice(-MAX_MESSAGES_PER_CHAT)
      : messages;
  await kv.put(chatMsgKey(userId, chatId), JSON.stringify(trimmed), {
    expirationTtl: MSG_TTL_SECONDS,
  });
}

/* ── Schemas ────────────────────────────────── */

/**
 * AI SDK v6 useChat sends UIMessage[] with `parts` instead of `content`.
 * DefaultChatTransport also adds `id`, `trigger`, `messageId`.
 */
const UIMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  reasoning: z.string().optional(),
});

const StreamRequestSchema = z.object({
  chatId: z.string().min(1).max(100),
  provider: z.enum(['claude', 'gemini']),
  model: z.string().max(50).optional(),
  sessionId: z.string().max(100).optional(),
  // AI SDK v6 transport fields
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(['user', 'assistant', 'system']),
        // v6 UIMessage uses parts[], content may be absent
        content: z.string().optional(),
        parts: z.array(UIMessagePartSchema).optional(),
      })
    )
    .min(1),
});

/** Extract text content from a UIMessage (handles both parts[] and content) */
function extractTextFromMessage(msg: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
  if (msg.parts && msg.parts.length > 0) {
    return msg.parts
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
      .join('');
  }
  return msg.content || '';
}

/* ── Shell escape ──────────────────────────── */

function shellEscape(s: string | undefined | null): string {
  const v = s ?? '';
  return `'${v.replace(/'/g, "'\\''")}'`;
}

/* ── Sandbox tools ─────────────────────────── */

function createSandboxTools(
  sandboxManager: SandboxManager,
  sessionId: string,
  env?: Env,
  userId?: string,
  credentials?: ProviderCredentials
) {
  const baseTools = {
    readFile: tool({
      description: 'Read a file from the workspace',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to the file'),
      }),
      execute: async ({ path }) => {
        const content = await sandboxManager.readFile(sessionId, path);
        return content ?? 'File not found';
      },
    }),
    listFiles: tool({
      description: 'List files in a directory',
      inputSchema: z.object({
        path: z.string().default('/workspace').describe('Directory path'),
      }),
      execute: async ({ path }) => {
        const dir = path || '/workspace';
        const result = await sandboxManager.execInSandbox(
          sessionId,
          `ls -la ${shellEscape(dir)}`
        );
        return result.stdout || result.stderr || 'Empty directory';
      },
    }),
    searchCode: tool({
      description: 'Search for a pattern in source files (literal/regex grep)',
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern (regex)'),
        path: z.string().default('/workspace').describe('Directory to search'),
      }),
      execute: async ({ pattern, path }) => {
        const dir = path || '/workspace';
        const glob = '*.{ts,tsx,js,jsx,json,md,css,html,py,rs,go}';
        const cmd = `grep -rn --include=${shellEscape(glob)} ${shellEscape(pattern)} ${shellEscape(dir)} | head -50`;
        const result = await sandboxManager.execInSandbox(sessionId, cmd);
        return result.stdout || result.stderr || 'No matches found';
      },
    }),
    ask_user_questions: tool({
      description: 'Present a structured form to collect user input before proceeding. Use when you need preferences, choices, or details from the user before starting a task.',
      inputSchema: z.object({
        title: z.string().optional().describe('Brief title shown above the questions'),
        questions: z.array(z.object({
          id: z.string().describe('Unique identifier for this question'),
          question: z.string().describe('The question text shown to the user'),
          type: z.enum(['text', 'select', 'multiselect', 'confirm']).describe('Input type'),
          options: z.array(z.string()).max(20).optional().describe('Choices for select/multiselect types'),
          placeholder: z.string().optional().describe('Placeholder text for text inputs'),
          required: z.boolean().default(true).describe('Whether an answer is required'),
        })).max(20).describe('List of questions to present'),
      }),
      execute: async ({ title, questions }) => {
        return `Presenting ${questions.length} question(s) to user${title ? `: "${title}"` : ''}. Waiting for answers.`;
      },
    }),
    create_plan: tool({
      description: 'Display a structured execution plan before starting a multi-step task. Call this to show your approach so the user understands what you are about to do.',
      inputSchema: z.object({
        title: z.string().describe('Plan title, e.g. "Refactoring Plan" or "Migration Steps"'),
        steps: z.array(z.object({
          id: z.string().describe('Step identifier, e.g. "1", "2a"'),
          label: z.string().describe('Short step label, e.g. "Analyze dependencies"'),
          detail: z.string().optional().describe('Optional one-sentence explanation of the step'),
        })).max(50).describe('Ordered steps in the plan'),
        estimatedSteps: z.number().optional().describe('Rough estimate of total tool calls needed'),
      }),
      execute: async ({ title, steps }) => {
        return `Plan ready: "${title}" — ${steps.length} step${steps.length === 1 ? '' : 's'}. Proceeding with execution.`;
      },
    }),
    runCommand: tool({
      description: 'Execute a shell command in the sandbox',
      inputSchema: z.object({
        command: z.string().describe('Shell command to execute'),
      }),
      needsApproval: true,
      execute: async ({ command }) => {
        const result = await sandboxManager.execInSandbox(
          sessionId,
          command,
          { timeout: 60000 }
        );
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      },
    }),
  };

  // Add semanticSearch if Gemini credentials are available
  const embeddingModel = credentials ? createEmbeddingModel(credentials) : null;
  if (!embeddingModel || !env || !userId) {
    return baseTools;
  }

  return {
    ...baseTools,
    semanticSearch: tool({
      description: 'Search workspace files by meaning/concept. Use for architecture, functionality, or "where is X?" questions. More powerful than grep for conceptual queries.',
      inputSchema: z.object({
        query: z.string().describe('Natural language description of what to find'),
        topK: z.number().min(1).max(20).default(5).describe('Number of results'),
      }),
      execute: async ({ query, topK }) => {
        const results = await searchEmbeddings(
          env.SESSIONS_KV, userId, sessionId, query, embeddingModel, topK
        );
        if (!results || results.length === 0) {
          return 'No embeddings index found. The workspace needs to be indexed first (happens automatically on session create, or use the Re-index button).';
        }
        return results
          .map((r) => `[${(r.score * 100).toFixed(0)}%] ${r.path}\n  ${r.snippet}`)
          .join('\n\n');
      },
    }),
  };
}

/* ── Routes ─────────────────────────────────── */

// POST /stream — AI SDK data stream (consumed by useChat on frontend)
quickchatRoutes.post('/stream', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = StreamRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid input',
      },
      400
    );
  }

  const { chatId, provider, model: modelAlias, messages, sessionId } = parsed.data;

  // Extract the last user message for KV persistence
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserContent = lastUserMsg ? extractTextFromMessage(lastUserMsg) : '';

  // Get credentials
  const creds = await getProviderCredentials(
    c.env.SESSIONS_KV,
    user.id,
    user.claudeToken
  );

  let aiModel;
  try {
    aiModel = createModel(provider as ProviderName, creds, modelAlias);
  } catch (err) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error:
          err instanceof Error ? err.message : 'Failed to create AI model',
      },
      400
    );
  }

  // Build tools if the user has an active sandbox session
  const sandboxManager: SandboxManager | null = sessionId
    ? c.get('sandboxManager')
    : null;
  const tools = sandboxManager && sessionId
    ? createSandboxTools(sandboxManager, sessionId, c.env, user.id, creds)
    : undefined;

  // Build system prompt — add semantic search guidance if available
  const hasSemanticSearch = tools && 'semanticSearch' in tools;
  const systemParts: string[] = [
    'You are a helpful coding assistant with access to a cloud development sandbox.',
  ];
  if (hasSemanticSearch) {
    systemParts.push(
      'You have access to a semanticSearch tool that finds files by meaning.',
      'Use it proactively when the user asks about code architecture,',
      'functionality, or "where is X?" questions.',
      'After using semanticSearch, reference the specific files you found',
      'in your response with full paths.'
    );
  }

  // Stream using AI SDK — returns UIMessageStream for useChat v6
  const result = streamText({
    model: aiModel,
    system: systemParts.join(' '),
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: extractTextFromMessage(m),
    })),
    maxOutputTokens: 16384,
    ...(tools ? { tools, stopWhen: stepCountIs(10) } : {}),
  });

  // Persist messages to KV after stream completes (background)
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const fullText = await result.text;

        const now = new Date().toISOString();
        const existing = await readMessages(
          c.env.SESSIONS_KV,
          user.id,
          chatId
        );

        const userMsg: QuickChatMessage = {
          id: `${Date.now()}-u`,
          role: 'user',
          content: lastUserContent,
          provider: provider as ProviderName,
          model: modelAlias,
          createdAt: now,
        };

        const assistantMsg: QuickChatMessage = {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: fullText,
          provider: provider as ProviderName,
          model: modelAlias,
          createdAt: now,
        };

        await writeMessages(c.env.SESSIONS_KV, user.id, chatId, [
          ...existing,
          userMsg,
          assistantMsg,
        ]);

        // Update chat list
        const chatList = await readChatList(c.env.SESSIONS_KV, user.id);
        const existingIdx = chatList.findIndex((ch) => ch.id === chatId);
        const title =
          lastUserContent.length > 60
            ? lastUserContent.slice(0, 57) + '...'
            : lastUserContent;

        if (existingIdx >= 0) {
          chatList[existingIdx] = {
            ...chatList[existingIdx],
            updatedAt: now,
            messageCount: existing.length + 2,
          };
        } else {
          chatList.unshift({
            id: chatId,
            title,
            provider: provider as ProviderName,
            model: modelAlias,
            createdAt: now,
            updatedAt: now,
            messageCount: 2,
          });
        }

        await writeChatList(c.env.SESSIONS_KV, user.id, chatList.slice(0, 50));
      } catch (err) {
        console.error('[quickchat/stream] KV persist error:', err);
      }
    })()
  );

  return result.toUIMessageStreamResponse();
});

// GET /list — list quick chat conversations + available providers
quickchatRoutes.get('/list', async (c) => {
  const user = c.get('user');
  const [chatList, availableProviders] = await Promise.all([
    readChatList(c.env.SESSIONS_KV, user.id),
    getAvailableProviders(c.env.SESSIONS_KV, user.id, user.claudeToken),
  ]);

  return c.json<
    ApiResponse<{
      chats: QuickChatMeta[];
      availableProviders: ProviderName[];
    }>
  >({
    success: true,
    data: { chats: chatList, availableProviders },
  });
});

// GET /:chatId/history — get messages for a chat
quickchatRoutes.get('/:chatId/history', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const messages = await readMessages(
    c.env.SESSIONS_KV,
    user.id,
    chatId
  );

  return c.json<ApiResponse<QuickChatMessage[]>>({
    success: true,
    data: messages,
  });
});

// DELETE /:chatId — delete a chat
quickchatRoutes.delete('/:chatId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');

  // Remove messages
  await c.env.SESSIONS_KV.delete(chatMsgKey(user.id, chatId));

  // Remove from list
  const chatList = await readChatList(c.env.SESSIONS_KV, user.id);
  const filtered = chatList.filter((ch) => ch.id !== chatId);
  await writeChatList(c.env.SESSIONS_KV, user.id, filtered);

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});
