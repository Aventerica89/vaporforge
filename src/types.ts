import { z } from 'zod';

// Session schemas
export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sandboxId: z.string().optional(),
  projectPath: z.string().optional(),
  gitRepo: z.string().optional(),
  status: z.enum(['creating', 'active', 'sleeping', 'terminated', 'pending-delete']),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  sdkSessionId: z.string().optional(), // Claude SDK session ID for conversation continuity
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
  z.object({
    type: z.literal('mcp_relay_request'),
    requestId: z.string(),
    serverName: z.string(),
    body: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('mcp_relay_response'),
    requestId: z.string(),
    body: z.record(z.unknown()),
    error: z.string().optional(),
  }),
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

// Auth schemas
export const UserRoles = ['user', 'admin'] as const;
export type UserRole = typeof UserRoles[number];

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  claudeToken: z.string().optional(),
  role: z.enum(UserRoles).default('user'),
  createdAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export const AuthTokenPayload = z.object({
  sub: z.string(), // user id
  email: z.string(),
  role: z.enum(UserRoles).default('user'),
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

// Setup token request (user pastes token from `claude setup-token`)
export const SetupTokenRequestSchema = z.object({
  token: z.string().min(10).max(500),
});

export type SetupTokenRequest = z.infer<typeof SetupTokenRequestSchema>;

// MCP Server config (KV-persisted)
export const McpServerConfigSchema = z.object({
  name: z.string().min(1).max(100).regex(
    /^[a-zA-Z0-9_-]+$/,
    'Name must be alphanumeric, dashes, or underscores'
  ),
  transport: z.enum(['http', 'stdio', 'relay']),
  url: z.string().url().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  /** Local URL for relay transport (e.g. http://localhost:9222) */
  localUrl: z.string().url().optional(),
  /** HTTP headers for auth (e.g. { Authorization: "Bearer ..." }) */
  headers: z.record(z.string()).optional(),
  /** Env vars for stdio servers (e.g. { GITHUB_TOKEN: "ghp_..." }) */
  env: z.record(z.string()).optional(),
  /** Credential files to write into the container (e.g. OAuth credentials) */
  credentialFiles: z.array(z.object({
    path: z.string().min(1).max(500),
    content: z.string().min(1).max(10_000),
  })).max(5).optional(),
  /** Cached tool names from last ping (display only) */
  tools: z.array(z.string()).optional(),
  /** Total tool count from last ping */
  toolCount: z.number().optional(),
  enabled: z.boolean().default(true),
  addedAt: z.string(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// Plugin item (agent, command, or rule)
export const PluginItemSchema = z.object({
  name: z.string().min(1).max(100),
  filename: z.string().min(1).max(200),
  content: z.string().max(50_000),
  enabled: z.boolean().default(true),
});

export type PluginItem = z.infer<typeof PluginItemSchema>;

// Plugin (KV-persisted)
export const PluginSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  repoUrl: z.string().url().optional(),
  scope: z.enum(['local', 'git']),
  enabled: z.boolean().default(true),
  builtIn: z.boolean().default(false),
  agents: z.array(PluginItemSchema).default([]),
  commands: z.array(PluginItemSchema).default([]),
  rules: z.array(PluginItemSchema).default([]),
  mcpServers: z.array(McpServerConfigSchema).default([]),
  addedAt: z.string(),
  updatedAt: z.string(),
});

export type Plugin = z.infer<typeof PluginSchema>;

// User config file (standalone rules, commands, agents — KV-persisted)
export const ConfigFileSchema = z.object({
  filename: z.string().min(1).max(200).regex(
    /^[a-zA-Z0-9._-]+\.md$/,
    'Filename must end in .md and contain only alphanumeric, dots, dashes, or underscores'
  ),
  content: z.string().max(50_000),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

/** Valid categories for user config files */
export const CONFIG_CATEGORIES = ['rules', 'commands', 'agents'] as const;
export type ConfigCategory = typeof CONFIG_CATEGORIES[number];

// AI Provider config (KV-persisted)
export const AIProviderConfigSchema = z.object({
  gemini: z.object({
    enabled: z.boolean(),
    defaultModel: z.enum(['flash', 'pro', '3.1-pro']).default('flash'),
    addedAt: z.string(),
  }).optional(),
  claude: z.object({
    enabled: z.boolean(),
    defaultModel: z.enum(['sonnet', 'haiku', 'opus']).default('sonnet'),
    addedAt: z.string(),
  }).optional(),
  openai: z.object({
    enabled: z.boolean(),
    defaultModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini']).default('gpt-4o'),
    addedAt: z.string(),
  }).optional(),
});

export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;
