import { Hono } from 'hono';
import { z } from 'zod';
import type { User, Message, ApiResponse } from '../types';

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
    // Route through Claude Code in the sandbox
    const claudeResponse = await callClaudeInSandbox(
      sandboxManager,
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

  // For streaming, use SSE with sandbox exec
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  c.executionCtx.waitUntil((async () => {
    try {
      const response = await callClaudeInSandbox(
        sandboxManager,
        sessionId,
        user,
        prompt
      );

      // Send the full response as a single chunk
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'text', content: response })}\n\n`
        )
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

// Call Claude Code inside the sandbox
// Uses `claude -p "prompt"` which handles OAuth auth natively
async function callClaudeInSandbox(
  sandboxManager: import('../sandbox').SandboxManager,
  sessionId: string,
  user: User,
  prompt: string
): Promise<string> {
  if (!user.claudeToken) {
    throw new Error('No Claude token available. Please re-authenticate.');
  }

  // Escape the prompt for shell safety
  const escapedPrompt = prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''");

  // Run claude in print mode inside the sandbox
  // Pass the OAuth token via CLAUDE_API_KEY env var
  // Claude Code will handle the authentication
  const result = await sandboxManager.execInSandbox(
    sessionId,
    `CLAUDE_API_KEY='${escapedToken(user.claudeToken)}' claude -p '${escapedPrompt}'`,
    {
      cwd: '/workspace',
      timeout: 120000, // 2 minute timeout for AI responses
    }
  );

  if (result.exitCode !== 0) {
    // If CLAUDE_API_KEY doesn't work, try writing credentials directly
    if (result.stderr.includes('authentication') || result.stderr.includes('token')) {
      return await callClaudeWithCredFile(
        sandboxManager,
        sessionId,
        user,
        prompt,
        escapedPrompt
      );
    }
    throw new Error(
      result.stderr || 'Claude Code returned an error'
    );
  }

  return result.stdout.trim() || 'No response from Claude';
}

// Fallback: write credentials file and retry
async function callClaudeWithCredFile(
  sandboxManager: import('../sandbox').SandboxManager,
  sessionId: string,
  user: User,
  _prompt: string,
  escapedPrompt: string
): Promise<string> {
  // Write OAuth token to Claude Code's config
  const credJson = JSON.stringify({
    oauth_token: user.claudeToken,
  });

  await sandboxManager.execInSandbox(
    sessionId,
    `mkdir -p ~/.claude && echo '${credJson.replace(/'/g, "'\\''")}' > ~/.claude/.credentials.json`,
    { timeout: 5000 }
  );

  // Retry with credentials file in place
  const result = await sandboxManager.execInSandbox(
    sessionId,
    `claude -p '${escapedPrompt}'`,
    {
      cwd: '/workspace',
      timeout: 120000,
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || 'Claude Code failed after credential setup'
    );
  }

  return result.stdout.trim() || 'No response from Claude';
}

// Helper to escape token for shell
function escapedToken(token: string): string {
  return token.replace(/'/g, "'\\''");
}
