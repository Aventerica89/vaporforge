import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Message, ApiResponse, Session } from '../types';

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

  // SECURITY FIX: Validate token exists before processing
  if (!user.claudeToken) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'No Claude token. Please re-authenticate.',
    }, 401);
  }

  // SECURITY FIX: Only accept OAuth tokens (MANDATORY per CLAUDE.md)
  if (!user.claudeToken.startsWith('sk-ant-oat01-')) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Only Claude OAuth tokens accepted. Run `claude setup-token`.',
    }, 401);
  }

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

  // For streaming, we need to run SDK in sandbox and parse output line-by-line
  // This is more complex than direct import but enables proper conversation continuity
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

      if (!session || !session.sandboxId) {
        throw new Error('Session or sandbox not found');
      }

      const sdkSessionId = session.sdkSessionId || '';
      const cwd = session.projectPath || '/workspace';

      // Execute SDK wrapper script with streaming output
      // Shell-escape args to handle spaces/special chars in prompts
      const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
      const cmd = `node /workspace/claude-agent.js ${shellEscape(prompt)} ${shellEscape(sdkSessionId)} ${shellEscape(cwd)}`;

      const result = await sandboxManager.execInSandbox(
        session.sandboxId!,
        cmd,
        {
          env: {
            CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken!,
            NODE_PATH: '/usr/local/lib/node_modules',
          },
          timeout: 300000, // 5 min
        }
      );

      if (result.exitCode !== 0) {
        throw new Error(result.stderr || 'SDK script failed');
      }

      // Parse stdout line-by-line for streaming messages
      const lines = result.stdout.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const msg = JSON.parse(line);

          if (msg.type === 'session-init') {
            newSdkSessionId = msg.sessionId;
          } else if (msg.type === 'text-delta') {
            fullResponse += msg.text;
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: msg.text })}\n\n`
              )
            );
          } else if (msg.type === 'done') {
            fullResponse = msg.fullText;
            newSdkSessionId = msg.sessionId;
          } else if (msg.type === 'error') {
            throw new Error(msg.error);
          }
        } catch (parseError) {
          // Ignore non-JSON lines
          continue;
        }
      }

      // Update session with new SDK sessionId for conversation continuity
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
// Runs SDK INSIDE the Cloudflare Sandbox container (correct architecture per Anthropic docs)
// This enables the SDK to maintain shell state, execute commands, and persist conversation context
async function callClaudeInSandbox(
  sandboxManager: import('../sandbox').SandboxManager,
  sessionsKv: KVNamespace,
  sessionId: string,
  user: User,
  prompt: string
): Promise<{ response: string; sdkSessionId: string }> {
  // SECURITY: Validate token exists
  if (!user.claudeToken) {
    throw new Error('No Claude token available. Please re-authenticate.');
  }

  // SECURITY: Only accept OAuth tokens (MANDATORY per CLAUDE.md)
  if (!user.claudeToken.startsWith('sk-ant-oat01-')) {
    throw new Error('Only Claude OAuth tokens accepted. Run `claude setup-token` to obtain one.');
  }

  // Get session to retrieve SDK sessionId for conversation continuity
  const session = await sessionsKv.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.sandboxId) {
    throw new Error('Sandbox not active');
  }

  // Build command to run SDK script in container
  const sdkSessionId = session.sdkSessionId || '';
  const cwd = session.projectPath || '/workspace';

  // Execute SDK wrapper script inside sandbox container
  // Shell-escape args to handle spaces/special chars in prompts
  const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const cmd = `node /workspace/claude-agent.js ${shellEscape(prompt)} ${shellEscape(sdkSessionId)} ${shellEscape(cwd)}`;

  const result = await sandboxManager.execInSandbox(
    session.sandboxId,
    cmd,
    {
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken,
        NODE_PATH: '/usr/local/lib/node_modules',
      },
      timeout: 300000, // 5 min
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Claude SDK script failed');
  }

  // Parse stdout for session ID and response
  const lines = result.stdout.split('\n').filter(l => l.trim());
  let newSessionId = sdkSessionId;
  let responseText = '';

  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'session-init') {
        newSessionId = msg.sessionId;
      } else if (msg.type === 'done') {
        responseText = msg.fullText;
        newSessionId = msg.sessionId;
      } else if (msg.type === 'error') {
        throw new Error(msg.error);
      }
    } catch (parseError) {
      // Ignore non-JSON lines (debug output, etc.)
      continue;
    }
  }

  // Update session with new SDK sessionId for conversation continuity
  if (newSessionId !== session.sdkSessionId) {
    await sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify({ ...session, sdkSessionId: newSessionId })
    );
  }

  return {
    response: responseText || 'No response from Claude',
    sdkSessionId: newSessionId,
  };
}
