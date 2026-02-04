import { z } from 'zod';

// Session schemas
export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sandboxId: z.string().optional(),
  projectPath: z.string().optional(),
  gitRepo: z.string().optional(),
  status: z.enum(['creating', 'active', 'sleeping', 'terminated']),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  toolCalls: z.array(z.object({
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
    output: z.string().optional(),
  })).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// File operation schemas
export const FileSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  modifiedAt: z.string().optional(),
  content: z.string().optional(),
});

export type FileInfo = z.infer<typeof FileSchema>;

// Chat request schemas
export const ChatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  context: z.object({
    currentFile: z.string().optional(),
    selectedCode: z.string().optional(),
    recentFiles: z.array(z.string()).optional(),
  }).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// WebSocket message schemas
export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat'),
    sessionId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('stream_start'),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal('stream_delta'),
    messageId: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('stream_end'),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal('tool_call'),
    messageId: z.string(),
    tool: z.string(),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    messageId: z.string(),
    output: z.string(),
  }),
  z.object({
    type: z.literal('file_change'),
    path: z.string(),
    action: z.enum(['create', 'update', 'delete']),
  }),
  z.object({
    type: z.literal('terminal_output'),
    sessionId: z.string(),
    output: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('pong'),
  }),
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

// Auth schemas
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  claudeToken: z.string().optional(),
  createdAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export const AuthTokenPayload = z.object({
  sub: z.string(), // user id
  email: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export type AuthTokenPayloadType = z.infer<typeof AuthTokenPayload>;

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// Sandbox command execution
export const ExecResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  duration: z.number(),
});

export type ExecResult = z.infer<typeof ExecResultSchema>;

// Git operations
export const GitStatusSchema = z.object({
  branch: z.string(),
  ahead: z.number(),
  behind: z.number(),
  staged: z.array(z.string()),
  modified: z.array(z.string()),
  untracked: z.array(z.string()),
});

export type GitStatus = z.infer<typeof GitStatusSchema>;

export const GitCommitSchema = z.object({
  hash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
});

export type GitCommit = z.infer<typeof GitCommitSchema>;

// OAuth session schemas (1Code-style OAuth flow)
export const OAuthSessionSchema = z.object({
  id: z.string(),
  state: z.enum([
    'starting',
    'waiting_url',
    'has_url',
    'waiting_code',
    'success',
    'error',
  ]),
  oauthUrl: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
});

export type OAuthSession = z.infer<typeof OAuthSessionSchema>;

// Claude credentials from ~/.claude/.credentials.json
export const ClaudeCredentialsSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
    scopes: z.array(z.string()),
  }),
});

export type ClaudeCredentials = z.infer<typeof ClaudeCredentialsSchema>;
