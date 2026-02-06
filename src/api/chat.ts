import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Message, ApiResponse, Session } from '../types';

// Dynamic import for ESM module - CACHED to avoid re-importing on every message
let cachedClaudeQuery: typeof import('@anthropic-ai/claude-agent-sdk').query | null = null;
const getClaudeQuery = async () => {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery;
  }
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  cachedClaudeQuery = sdk.query;
  return cachedClaudeQuery;
};

type Variables = {
  user: User;
  sandboxManager: import('../sandbox').SandboxManager;
};

export const chatRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const SendMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string().min(1).max(100000),
  context: z.object({
    currentFile: z.string().optional(),
    selectedCode: z.string().optional(),
    recentFiles: z.array(z.string()).optional(),
  }).optional(),
});

// Send a message to Claude (via Claude Code in sandbox)
chatRoutes.post('/send', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');

  const body = await c.req.json();
  const parsed = SendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  const { sessionId, message, context } = parsed.data;

  // Verify session belongs to user
  const session = await sandboxManager.getOrWakeSandbox(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  const messageId = crypto.randomUUID();

  // Store user message
  const userMessage: Message = {
    id: messageId,
    sessionId,
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  };

  await c.env.SESSIONS_KV.put(
    `message:${sessionId}:${messageId}`,
    JSON.stringify(userMessage),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );

  // Build prompt with context
  let prompt = message;

  if (context?.currentFile) {
    prompt = `I'm currently viewing: ${context.currentFile}\n\n${message}`;
  }

  if (context?.selectedCode) {
    prompt = `Selected code:\n\`\`\`\n${context.selectedCode}\n\`\`\`\n\n${message}`;
  }

  try {
    // Route through Claude Code SDK
    const { response: claudeResponse } = await callClaudeInSandbox(
      sandboxManager,
      c.env.SESSIONS_KV,
      sessionId,
      user,
      prompt
    );

    // Store assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'assistant',
      content: claudeResponse,
      timestamp: new Date().toISOString(),
    };

    await c.env.SESSIONS_KV.put(
      `message:${sessionId}:${assistantMessage.id}`,
      JSON.stringify(assistantMessage),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    return c.json<ApiResponse<Message>>({
      success: true,
      data: assistantMessage,
    });
  } catch (error) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get response',
    }, 500);
  }
});

// Get message history
chatRoutes.get('/history/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const sessionId = c.req.param('sessionId');

  // Verify session belongs to user
  const session = await sandboxManager.getOrWakeSandbox(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  // List messages for session
  const messages: Message[] = [];
  const prefix = `message:${sessionId}:`;

  const list = await c.env.SESSIONS_KV.list({ prefix });

  for (const key of list.keys) {
    const message = await c.env.SESSIONS_KV.get<Message>(key.name, 'json');
    if (message) {
      messages.push(message);
    }
  }

  // Sort by timestamp
  messages.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return c.json<ApiResponse<Message[]>>({
    success: true,
    data: messages,
    meta: {
      total: messages.length,
    },
  });
});

// Streaming endpoint for real-time responses
chatRoutes.post('/stream', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');

  const body = await c.req.json();
  const parsed = SendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.message,
    }, 400);
  }

  const { sessionId, message, context } = parsed.data;

  // Verify session belongs to user
  const session = await sandboxManager.getOrWakeSandbox(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  // Build prompt with context
  let prompt = message;
  if (context?.currentFile) {
    prompt = `I'm currently viewing: ${context.currentFile}\n\n${message}`;
  }

  // Save user message first
  const userMessageId = crypto.randomUUID();
  const userMessage: Message = {
    id: userMessageId,
    sessionId,
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  };

  await c.env.SESSIONS_KV.put(
    `message:${sessionId}:${userMessageId}`,
    JSON.stringify(userMessage),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );

  // For streaming, use SSE with Claude SDK
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  c.executionCtx.waitUntil((async () => {
    let fullResponse = '';
    let newSdkSessionId = '';

    try {
      // Get session to retrieve SDK sessionId
      const session = await c.env.SESSIONS_KV.get<Session>(
        `session:${sessionId}`,
        'json'
      );

      if (!session) {
        throw new Error('Session not found');
      }

      // Get Claude SDK query function
      const claudeQuery = await getClaudeQuery();

      // Build query options
      const queryOptions = {
        prompt,
        cwd: session.projectPath || '/workspace',
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken?.startsWith('sk-ant-oat01-')
            ? user.claudeToken
            : undefined,
          ANTHROPIC_API_KEY: user.claudeToken?.startsWith('sk-ant-oat01-')
            ? undefined
            : user.claudeToken,
        },
        ...(session.sdkSessionId
          ? { resume: session.sdkSessionId, continue: true }
          : { continue: true }
        ),
        model: 'claude-sonnet-4-5',
      };

      // Stream Claude SDK response
      const stream = claudeQuery(queryOptions);

      for await (const msg of stream) {
        const msgAny = msg as any;

        // Extract session ID
        if (msgAny.type === 'session-init' && msgAny.sessionId) {
          newSdkSessionId = msgAny.sessionId;
        }

        // Stream text deltas
        if (msgAny.event?.type === 'content_block_delta') {
          const delta = msgAny.event.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            fullResponse += delta.text;
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: delta.text })}\n\n`
              )
            );
          }
        }

        // Handle errors
        if (msgAny.type === 'error') {
          throw new Error(msgAny.errorText || 'Claude SDK error');
        }
      }

      // Update session with new SDK sessionId
      if (newSdkSessionId && newSdkSessionId !== session.sdkSessionId) {
        const updatedSession: Session = {
          ...session,
          sdkSessionId: newSdkSessionId,
        };
        await c.env.SESSIONS_KV.put(
          `session:${sessionId}`,
          JSON.stringify(updatedSession)
        );
      }

      // Save assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };

      await c.env.SESSIONS_KV.put(
        `message:${sessionId}:${assistantMessage.id}`,
        JSON.stringify(assistantMessage),
        { expirationTtl: 7 * 24 * 60 * 60 }
      );

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`
        )
      );
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Call Claude Code using the SDK with conversation history
// Maintains session state for conversation continuity
async function callClaudeInSandbox(
  sandboxManager: import('../sandbox').SandboxManager,
  sessionsKv: KVNamespace,
  sessionId: string,
  user: User,
  prompt: string
): Promise<{ response: string; sdkSessionId: string }> {
  if (!user.claudeToken) {
    throw new Error('No Claude token available. Please re-authenticate.');
  }

  // Get session to retrieve SDK sessionId for conversation continuity
  const session = await sessionsKv.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session) {
    throw new Error('Session not found');
  }

  // Get Claude SDK query function
  const claudeQuery = await getClaudeQuery();

  // Build query options
  const queryOptions = {
    prompt,
    cwd: session.projectPath || '/workspace',
    env: {
      // Inject Claude token as env var
      CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken.startsWith('sk-ant-oat01-')
        ? user.claudeToken
        : undefined,
      ANTHROPIC_API_KEY: user.claudeToken.startsWith('sk-ant-oat01-')
        ? undefined
        : user.claudeToken,
    },
    // Session handling: resume existing session or start new one
    ...(session.sdkSessionId
      ? { resume: session.sdkSessionId, continue: true }
      : { continue: true }
    ),
    model: 'claude-sonnet-4-5',
  };

  // Run Claude SDK query
  const stream = claudeQuery(queryOptions);

  // Collect response text and track sessionId
  let responseText = '';
  let newSdkSessionId = session.sdkSessionId || '';

  try {
    for await (const msg of stream) {
      const msgAny = msg as any;

      // Extract session ID from session-init event
      if (msgAny.type === 'session-init' && msgAny.sessionId) {
        newSdkSessionId = msgAny.sessionId;
      }

      // Extract text deltas from content blocks
      if (msgAny.event?.type === 'content_block_delta') {
        const delta = msgAny.event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          responseText += delta.text;
        }
      }

      // Handle errors
      if (msgAny.type === 'error') {
        throw new Error(msgAny.errorText || 'Claude SDK returned an error');
      }
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to stream Claude response'
    );
  }

  // Update session with new SDK sessionId
  if (newSdkSessionId && newSdkSessionId !== session.sdkSessionId) {
    const updatedSession: Session = {
      ...session,
      sdkSessionId: newSdkSessionId,
    };
    await sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(updatedSession)
    );
  }

  return {
    response: responseText.trim() || 'No response from Claude',
    sdkSessionId: newSdkSessionId,
  };
}
