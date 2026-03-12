import { Hono } from 'hono';
import { z } from 'zod';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
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
 * Parts include text, reasoning, tool calls, approval requests/responses, etc.
 * We accept any object here and let convertToModelMessages handle the parsing.
 */
const UIMessagePartSchema = z.object({ type: z.string() }).passthrough();

const StreamRequestSchema = z.object({
  chatId: z.string().min(1).max(100),
  provider: z.enum(['claude', 'gemini', 'openai']),
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
    create_github_issue: tool({
      description: 'Create a GitHub issue on a repository. Use to report bugs, log debug findings, or track tasks for the main session to act on.',
      inputSchema: z.object({
        owner: z.string().describe('GitHub repo owner (username or org)'),
        repo: z.string().describe('GitHub repository name'),
        title: z.string().max(256).describe('Issue title'),
        body: z.string().max(65536).describe('Issue body in markdown'),
        labels: z.array(z.string()).max(10).optional().describe('Labels to apply'),
      }),
      execute: async ({ owner, repo, title, body, labels }) => {
        const githubToken = env?.GITHUB_TOKEN;
        if (!githubToken) {
          return 'No GITHUB_TOKEN configured on this server.';
        }
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
        const payload: Record<string, unknown> = { title, body };
        if (labels && labels.length > 0) payload.labels = labels;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
            'User-Agent': 'VaporForge/1.0',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          // 422 often means labels don't exist — retry without labels
          if (res.status === 422 && labels && labels.length > 0) {
            delete payload.labels;
            const retry = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${githubToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.github+json',
                'User-Agent': 'VaporForge/1.0',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              body: JSON.stringify(payload),
            });
            if (retry.ok) {
              const issue = await retry.json() as { number: number; html_url: string };
              return `Issue #${issue.number} created (labels skipped — not found on repo): ${issue.html_url}`;
            }
          }
          return `GitHub API error ${res.status}: ${errText.slice(0, 200)}`;
        }
        const issue = await res.json() as { number: number; html_url: string };
        return `Issue #${issue.number} created: ${issue.html_url}`;
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

/* ── Stream padding ─────────────────────────── */

/**
 * Pad each UIMessageStream event line to >1KB so Chrome's Fetch ReadableStream
 * buffer threshold is exceeded on every chunk.
 *
 * Chrome buffers ReadableStream chunks smaller than ~1KB before delivering to
 * reader.read(). AI SDK text-delta lines are ~30-100 bytes each, so without
 * padding all events accumulate and arrive in one batch at stream end — causing
 * the "pop-in" effect in useChat.
 *
 * The UIMessageStream protocol is line-oriented (e.g. `g:{"type":"text","value":"hi"}`).
 * JSON.parse ignores trailing whitespace so padding with spaces is safe.
 */
function padStreamLines(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let leftover = '';
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = leftover + dec.decode(chunk, { stream: true });
        const lines = text.split('\n');
        // Last element may be an incomplete line — carry it to the next chunk
        leftover = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          // Pad to 1025 bytes so Chrome delivers this line immediately
          const padded = line + ' '.repeat(Math.max(0, 1025 - line.length)) + '\n';
          controller.enqueue(enc.encode(padded));
        }
      },
      flush(controller) {
        if (leftover) {
          controller.enqueue(enc.encode(leftover + '\n'));
        }
      },
    })
  );
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
    'To run shell commands, always use the runCommand tool — never output raw XML, bash blocks, or tool-call markup.',
    'You have a create_github_issue tool — use it to file bug reports, debug findings,',
    'or tasks that the main Claude session should act on.',
    'When creating issues, detect the repo owner/name from .git/config or package.json in the workspace.',
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

  // Pre-process: auto-deny any tools in 'approval-requested' state (never answered).
  // convertToModelMessages keeps these parts but produces no tool-result, causing
  // "Tool result is missing" errors when the user sends a new message without approving.
  const resolvedMessages = messages.map((msg) => ({
    ...msg,
    parts: (msg.parts ?? []).map((part) => {
      const p = part as Record<string, unknown>;
      if (
        (p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-'))) &&
        p.state === 'approval-requested' &&
        typeof p.approval === 'object' &&
        p.approval !== null
      ) {
        return {
          ...p,
          state: 'output-denied',
          approval: {
            ...(p.approval as Record<string, unknown>),
            approved: false,
            reason: 'Command was not approved.',
          },
        };
      }
      return part;
    }),
  }));

  // Convert UIMessages to CoreMessages, preserving tool-call and approval parts.
  // This is required for the human-in-the-loop (needsApproval) flow: when the
  // user approves a tool, the transport re-POSTs with approval state embedded in
  // the message parts. A plain text extraction would lose that state.
  const modelMessages = await convertToModelMessages(
    resolvedMessages as Parameters<typeof convertToModelMessages>[0],
    { ignoreIncompleteToolCalls: true }
  );

  // Fix: Execute any approved-but-unexecuted tool calls and inject tool-results.
  //
  // Background: convertToModelMessages converts approval-responded tool parts into
  // CoreMessages that contain tool-approval-request (assistant) + tool-approval-response
  // (tool) — but NO tool-result. convertToLanguageModelMessage (inside streamText)
  // strips both approval parts before sending to the model, leaving the model with a
  // tool-call that has no result. Claude ignores this silently; Gemini (and OpenAI)
  // validate the history strictly and throw "Tool result is missing."
  //
  // Solution: detect this pattern, execute the approved tools eagerly, and inject
  // tool-result parts so the model receives a complete history.
  if (tools) {
    // Pass 1: build lookup maps from the CoreMessage history
    const approvalIdToCallId = new Map<string, string>();
    const callIdToArgs = new Map<string, { toolName: string; input: unknown }>();

    for (const msg of modelMessages) {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === 'tool-call') {
          callIdToArgs.set(part.toolCallId as string, {
            toolName: part.toolName as string,
            input: part.input,
          });
        } else if (part.type === 'tool-approval-request') {
          approvalIdToCallId.set(part.approvalId as string, part.toolCallId as string);
        }
      }
    }

    // Pass 2: find tool messages missing results, execute the tools, inject results
    for (const msg of modelMessages) {
      if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue;
      const content = msg.content as Array<Record<string, unknown>>;
      if (content.some((p) => p.type === 'tool-result')) continue; // already complete

      for (const part of content) {
        if (part.type !== 'tool-approval-response' || part.approved !== true) continue;
        const callId = approvalIdToCallId.get(part.approvalId as string);
        const args = callId ? callIdToArgs.get(callId) : undefined;
        if (!callId || !args) continue;

        const t = (tools as Record<string, { execute?: (i: unknown, opts: { messages: unknown[]; abortSignal: AbortSignal }) => Promise<unknown> }>)[args.toolName];
        if (!t?.execute) continue;

        let output: string;
        try {
          const result = await t.execute(args.input, {
            messages: [],
            abortSignal: new AbortController().signal,
          });
          output = typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
          output = `Tool execution error: ${String(err)}`;
        }

        (msg.content as unknown[]).push({
          type: 'tool-result',
          toolCallId: callId,
          toolName: args.toolName,
          output: { type: 'text', value: output },
        });
      }
    }
  }

  // Stream using AI SDK — returns UIMessageStream for useChat v6
  const result = streamText({
    model: aiModel,
    system: systemParts.join(' '),
    messages: modelMessages,
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

  // Disable CF/proxy compression — buffering kills streaming
  // See: https://ai-sdk.dev/docs/troubleshooting/streaming-not-working-when-proxied
  // Also pad each line to >1KB so Chrome's Fetch buffer threshold is exceeded
  // on every event and text-delta chunks are delivered immediately.
  try {
    const aiResponse = result.toUIMessageStreamResponse({
      headers: {
        'Content-Encoding': 'none',
      },
    });
    const paddedBody = padStreamLines(aiResponse.body!);
    return new Response(paddedBody, {
      headers: aiResponse.headers,
      status: aiResponse.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json<ApiResponse<never>>({ success: false, error: msg }, 500);
  }
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
