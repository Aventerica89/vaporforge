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

const StreamRequestSchema = z.object({
  chatId: z.string().min(1).max(100),
  message: z.string().min(1).max(50_000),
  provider: z.enum(['claude', 'gemini']),
  model: z.string().max(50).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

/* ── SSE helper ─────────────────────────────── */

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/* ── Routes ─────────────────────────────────── */

// POST /stream — SSE streaming quick chat
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

  const { chatId, message, provider, model: modelAlias, history } =
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

  // Build messages array
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
    [];

  // Include history if provided
  if (history) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: message });

  // Stream response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (data: Record<string, unknown>) =>
    writer.write(encoder.encode(sseEvent(data)));

  // Start streaming in background
  const streamPromise = (async () => {
    try {
      await write({ type: 'connected' });

      const result = streamText({
        model: aiModel,
        messages,
        maxTokens: 16384,
      });

      let fullText = '';
      let reasoningText = '';
      let eventCount = 0;

      for await (const part of result.fullStream) {
        eventCount++;
        if (part.type === 'text-delta') {
          // AI SDK v6: property is `text`, not `textDelta`
          const delta = (part as { text?: string }).text;
          if (delta) {
            fullText += delta;
            await write({ type: 'text', content: delta });
          }
        } else if (part.type === 'reasoning-delta') {
          // AI SDK v6: property is `text`, not `textDelta`
          const delta = (part as { text?: string }).text;
          if (delta) {
            reasoningText += delta;
            await write({ type: 'reasoning', content: delta });
          }
        } else if (part.type === 'error') {
          console.error('[quickchat/stream] Stream error event:', part);
          const msg = (part as { error?: unknown }).error;
          await write({ type: 'error', content: String(msg) });
        }
      }

      // Log diagnostic info if no text was produced
      if (!fullText && eventCount === 0) {
        console.error('[quickchat/stream] Zero stream events received');
      } else if (!fullText) {
        console.error(
          `[quickchat/stream] ${eventCount} events but no text output`
        );
      }

      await write({ type: 'done', fullText });

      // Persist messages after stream completes
      const now = new Date().toISOString();
      const existing = await readMessages(
        c.env.SESSIONS_KV,
        user.id,
        chatId
      );

      const userMsg: QuickChatMessage = {
        id: `${Date.now()}-u`,
        role: 'user',
        content: message,
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
      const chatList = await readChatList(
        c.env.SESSIONS_KV,
        user.id
      );
      const existingIdx = chatList.findIndex((ch) => ch.id === chatId);
      const title =
        message.length > 60
          ? message.slice(0, 57) + '...'
          : message;

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

      // Keep last 50 chats
      await writeChatList(
        c.env.SESSIONS_KV,
        user.id,
        chatList.slice(0, 50)
      );
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Stream error';
      console.error('[quickchat/stream] Error:', errMsg, err);
      try {
        await write({ type: 'error', content: errMsg });
      } catch {
        // writer may already be closed
      }
    } finally {
      await writer.close();
    }
  })();

  // Use waitUntil to keep the stream alive after response is sent
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
