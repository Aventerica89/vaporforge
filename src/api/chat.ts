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

// Send a message to Claude
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

  // Build system context
  let systemContext = 'You are Claude, an AI assistant helping with coding tasks.';

  if (context?.currentFile) {
    systemContext += `\n\nThe user is currently viewing: ${context.currentFile}`;

    // Read file content if in sandbox
    if (session.sandboxId) {
      const content = await sandboxManager.readFile(
        session.sandboxId,
        context.currentFile
      );
      if (content) {
        systemContext += `\n\nFile content:\n\`\`\`\n${content}\n\`\`\``;
      }
    }
  }

  if (context?.selectedCode) {
    systemContext += `\n\nSelected code:\n\`\`\`\n${context.selectedCode}\n\`\`\``;
  }

  try {
    // Call Claude API
    const claudeResponse = await callClaudeAPI(
      c.env,
      user,
      systemContext,
      message,
      sessionId,
      sandboxManager
    );

    // Store assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'assistant',
      content: claudeResponse.content,
      timestamp: new Date().toISOString(),
      toolCalls: claudeResponse.toolCalls,
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

  // Note: KV list is eventually consistent
  // For production, use Durable Objects or D1 for message storage
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

  // Create streaming response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start streaming in background
  c.executionCtx.waitUntil((async () => {
    try {
      await streamClaudeResponse(
        c.env,
        user,
        message,
        sessionId,
        sandboxManager,
        context,
        async (chunk) => {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
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

// Helper function to call Claude API
async function callClaudeAPI(
  env: Env,
  user: User,
  systemContext: string,
  message: string,
  sessionId: string,
  sandboxManager: import('../sandbox').SandboxManager
): Promise<{ content: string; toolCalls?: Message['toolCalls'] }> {
  // Use user's Claude token if available, otherwise API key
  const apiKey = user.claudeToken || env.CLAUDE_API_KEY;

  if (!apiKey) {
    throw new Error('No API key available');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemContext,
      messages: [
        { role: 'user', content: message },
      ],
      tools: getAvailableTools(sessionId, sandboxManager),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  };

  // Process response
  let content = '';
  const toolCalls: Message['toolCalls'] = [];

  for (const block of data.content) {
    if (block.type === 'text' && block.text) {
      content += block.text;
    } else if (block.type === 'tool_use' && block.id && block.name && block.input) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }

  // Execute tool calls if any
  for (const tool of toolCalls) {
    const result = await executeToolCall(
      tool.name,
      tool.input,
      sessionId,
      sandboxManager
    );
    tool.output = result;
  }

  return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

// Stream Claude response
async function streamClaudeResponse(
  env: Env,
  user: User,
  message: string,
  sessionId: string,
  sandboxManager: import('../sandbox').SandboxManager,
  context?: { currentFile?: string; selectedCode?: string },
  onChunk?: (chunk: { type: string; content?: string; tool?: string }) => Promise<void>
): Promise<void> {
  const apiKey = user.claudeToken || env.CLAUDE_API_KEY;

  if (!apiKey) {
    throw new Error('No API key available');
  }

  let systemContext = 'You are Claude, an AI assistant helping with coding tasks.';

  if (context?.currentFile) {
    systemContext += `\n\nThe user is currently viewing: ${context.currentFile}`;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      stream: true,
      system: systemContext,
      messages: [
        { role: 'user', content: message },
      ],
      tools: getAvailableTools(sessionId, sandboxManager),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to stream response');
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: { type: string; text?: string };
          };

          if (event.type === 'content_block_delta' && event.delta?.text) {
            await onChunk?.({ type: 'text', content: event.delta.text });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// Get available tools for Claude
function getAvailableTools(
  sessionId: string,
  sandboxManager: import('../sandbox').SandboxManager
) {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_files',
      description: 'List files in a directory',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
        },
        required: ['path'],
      },
    },
    {
      name: 'execute_command',
      description: 'Execute a shell command',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
    },
  ];
}

// Execute a tool call
async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  sessionId: string,
  sandboxManager: import('../sandbox').SandboxManager
): Promise<string> {
  // Get session's sandbox ID
  const session = await sandboxManager.getOrWakeSandbox(sessionId);
  if (!session?.sandboxId) {
    return 'Error: No sandbox available';
  }

  switch (name) {
    case 'read_file': {
      const content = await sandboxManager.readFile(
        session.sandboxId,
        input.path as string
      );
      return content || 'Error: File not found';
    }

    case 'write_file': {
      const success = await sandboxManager.writeFile(
        session.sandboxId,
        input.path as string,
        input.content as string
      );
      return success ? 'File written successfully' : 'Error: Failed to write file';
    }

    case 'list_files': {
      const files = await sandboxManager.listFiles(
        session.sandboxId,
        input.path as string
      );
      return JSON.stringify(files, null, 2);
    }

    case 'execute_command': {
      const result = await sandboxManager.execInSandbox(
        session.sandboxId,
        ['sh', '-c', input.command as string],
        { cwd: input.cwd as string }
      );
      return `Exit code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
