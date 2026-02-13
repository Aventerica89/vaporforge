// Session types
export interface Session {
  id: string;
  userId: string;
  sandboxId?: string;
  projectPath?: string;
  gitRepo?: string;
  status: 'creating' | 'active' | 'sleeping' | 'terminated' | 'pending-delete';
  createdAt: string;
  lastActiveAt: string;
  metadata?: Record<string, unknown>;
}

/** A single step in a chain-of-thought reasoning block */
export interface ChainOfThoughtStep {
  title: string;
  content?: string;
  status: 'complete' | 'active' | 'pending';
  searchResults?: Array<{ title: string; url?: string }>;
  duration?: number;
}

// Structured message parts for rich rendering
export interface MessagePart {
  type: 'text' | 'tool-start' | 'tool-result' | 'error' | 'reasoning' | 'artifact' | 'chain-of-thought';
  content?: string;
  name?: string;
  /** Unique tool call ID — composite "parentId:childId" for nested agent tools */
  toolId?: string;
  input?: Record<string, unknown>;
  output?: string;
  /** Tool execution duration in ms (populated on tool-result) */
  duration?: number;
  /** Timestamp when tool-start was emitted (used to compute duration) */
  startedAt?: number;
  /** Code language for artifact parts */
  language?: string;
  /** Filename for artifact parts */
  filename?: string;
  /** Steps for chain-of-thought parts */
  steps?: ChainOfThoughtStep[];
}

// Message types
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  parts?: MessagePart[];
  /** Pasted image attachments with preview data URLs */
  images?: ImageAttachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

// File types
export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  content?: string;
}

// Git types
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// User types
export interface User {
  id: string;
  email: string;
  name?: string;
}

// API Response
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

// Image attachment for pasted images
export interface ImageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string; // base64 data URI for preview
  /** Sandbox path after upload */
  uploadedPath?: string;
}

// MCP Server config
export interface McpServerConfig {
  name: string;
  transport: 'http' | 'stdio' | 'relay';
  url?: string;
  command?: string;
  args?: string[];
  /** Local URL for relay transport (e.g. http://localhost:9222) */
  localUrl?: string;
  enabled: boolean;
  addedAt: string;
}

// Plugin item (agent, command, or rule)
export interface PluginItem {
  name: string;
  filename: string;
  content: string;
  enabled: boolean;
}

// Plugin
export interface Plugin {
  id: string;
  name: string;
  description?: string;
  repoUrl?: string;
  scope: 'local' | 'git';
  enabled: boolean;
  builtIn: boolean;
  agents: PluginItem[];
  commands: PluginItem[];
  rules: PluginItem[];
  mcpServers: McpServerConfig[];
  addedAt: string;
  updatedAt: string;
}

// Config file (standalone rules, commands, agents — KV-persisted)
export interface ConfigFile {
  filename: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ConfigCategory = 'rules' | 'commands' | 'agents';

// AI Provider config
export interface AIProviderConfig {
  gemini?: {
    enabled: boolean;
    defaultModel: 'flash' | 'pro';
    addedAt: string;
  };
}

// WebSocket message types
export type WSMessage =
  | { type: 'chat'; sessionId: string; message: string }
  | { type: 'stream_start'; messageId: string }
  | { type: 'stream_delta'; messageId: string; delta: string }
  | { type: 'stream_end'; messageId: string }
  | { type: 'tool_call'; messageId: string; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; messageId: string; output: string }
  | { type: 'file_change'; path: string; action: 'create' | 'update' | 'delete' }
  | { type: 'terminal_output'; sessionId: string; output: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'mcp_relay_request'; requestId: string; serverName: string; body: Record<string, unknown> }
  | { type: 'mcp_relay_response'; requestId: string; body: Record<string, unknown>; error?: string };
