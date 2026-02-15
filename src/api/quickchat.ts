import { Hono } from 'hono';
import { z } from 'zod';
import { streamText } from 'ai';
import type { User, ApiResponse } from '../types';
import {
  createModel,
  getProviderCredentials,
  getAvailableProviders,
  type ProviderName,
} from '../services/ai-provider-factory';

type Variables = { user: User };

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

  const { chatId, provider, model: modelAlias, messages } = parsed.data;

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

  // Stream using AI SDK — returns UIMessageStream for useChat v6
  const result = streamText({
    model: aiModel,
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: extractTextFromMessage(m),
    })),
    maxOutputTokens: 16384,
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
