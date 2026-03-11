# VaporForge Data Models & Types

**Last Updated:** 2026-03-11

## Backend Types (src/types.ts)

### Session

```typescript
interface Session {
  id: string;
  userId: string;
  sandboxId?: string;              // Container ID (empty if sleeping)
  projectPath?: string;            // Working directory in container
  gitRepo?: string;                // GitHub URL (cloned on startup)
  status: 'creating' | 'active' | 'sleeping' | 'terminated' | 'pending-delete';
  createdAt: string;               // ISO-8601
  lastActiveAt: string;            // ISO-8601
  sdkSessionId?: string;           // Claude SDK session for continuity
  containerBuild?: string;         // VF_CONTAINER_BUILD version
  metadata?: Record<string, unknown>;
}
```

**Storage:** KV `session:{sessionId}`

### Message

```typescript
interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;                 // Raw text or serialized frames
  timestamp: string;               // ISO-8601
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: string;
  }>;
}
```

**Storage:** KV `message:{sessionId}:{messageId}`

### User (Backend)

```typescript
interface User {
  id: string;                      // Hash of OAuth token
  email: string;
  role?: 'user' | 'admin';
  claudeToken: string;             // OAuth token (sk-ant-oat01-*)
  tokenExpiresAt?: string;         // For token refresh
  createdAt: string;
  lastLoginAt: string;
}
```

**Storage:** KV `user:{userId}` with TTL=30 days

### API Response Envelope

```typescript
interface ApiResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
}
```

## Frontend Types (ui/src/lib/types.ts)

### Session (Frontend)

Mirrors backend but with UI-specific fields:
```typescript
interface Session {
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
```

### Message Part (Rich NDJSON)

```typescript
interface MessagePart {
  type: 'text' | 'tool-start' | 'tool-result' | 'error' |
        'reasoning' | 'artifact' | 'chain-of-thought' |
        'commit' | 'test-results' | 'checkpoint-list' |
        'confirmation' | 'persona';

  // Common fields
  content?: string;
  name?: string;
  toolId?: string;                 // Composite "parentId:childId"
  input?: Record<string, unknown>;
  output?: string;
  duration?: number;               // Tool execution time (ms)
  startedAt?: number;              // Timestamp for duration calc

  // Artifact-specific
  language?: string;               // 'typescript', 'python', etc.
  filename?: string;

  // Chain-of-thought
  steps?: ChainOfThoughtStep[];

  // Commit
  commit?: {
    hash: string;
    message: string;
    author?: string;
    date?: string;
    files?: Array<{
      path: string;
      status: 'added' | 'modified' | 'deleted' | 'renamed';
      additions?: number;
      deletions?: number;
    }>;
  };

  // Test results
  testResults?: {
    status: 'pass' | 'fail' | 'running' | 'skip';
    suiteName?: string;
    passed?: number;
    failed?: number;
    skipped?: number;
    cases?: Array<{
      name: string;
      status: 'pass' | 'fail' | 'running' | 'skip';
      duration?: number;
      error?: string;
    }>;
  };
}
```

### ChainOfThoughtStep

```typescript
interface ChainOfThoughtStep {
  title: string;
  content?: string;
  status: 'complete' | 'active' | 'pending';
  searchResults?: Array<{ title: string; url?: string }>;
  duration?: number;
}
```

### User (Frontend)

```typescript
interface User {
  id: string;
  email: string;
  role?: string;
}
```

## Configuration Models

### SandboxConfig

**File:** `src/sandbox.ts`

Container startup configuration:
```typescript
interface SandboxConfig {
  gitRepo?: string;
  branch?: string;
  env?: Record<string, string>;             // Env vars
  claudeMd?: string;                        // User's CLAUDE.md
  mcpServers?: Record<string, Record<string, unknown>>;  // MCP config
  pluginConfigs?: {
    agents: Array<{ filename: string; content: string }>;
    commands: Array<{ filename: string; content: string }>;
    rules: Array<{ filename: string; content: string }>;
    mcpServers: Record<string, Record<string, unknown>>;
  };
  userConfigs?: {
    rules: Array<{ filename: string; content: string }>;
    commands: Array<{ filename: string; content: string }>;
    agents: Array<{ filename: string; content: string }>;
  };
  vfRules?: string;                         // VF internal rules
  startRelayProxy?: boolean;
}
```

### MCP Server Config

```typescript
interface McpServerConfig {
  name: string;
  description?: string;
  enabled: boolean;
  transport: 'http' | 'stdio' | 'relay';

  // Transport-specific
  url?: string;                             // For HTTP
  command?: string;                         // For stdio
  args?: string[];                          // Stdio args

  // Credentials
  credentials?: Record<string, string>;
  credentialPath?: string;                  // Where to inject creds
}
```

**Storage:** KV `user-mcp:${userId}` (JSON array)

### Plugin Manifest

```typescript
interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repository?: string;

  // Content paths in repo
  agents?: Array<{ filename: string; path: string }>;
  commands?: Array<{ filename: string; path: string }>;
  rules?: Array<{ filename: string; path: string }>;

  // MCP servers provided
  mcpServers?: Record<string, Record<string, unknown>>;
}
```

**Storage:** KV `user-plugins:${userId}` (JSON array of installed)

### AI Provider Config

```typescript
interface AIProviderConfig {
  provider: 'claude' | 'gemini' | 'openai';
  apiKey: string;                           // Encrypted in KV
  model?: string;
  enabled: boolean;
}
```

**Storage:** KV `user-ai-providers:${userId}` (JSON array, encrypted)

### File Info

```typescript
interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;              // ISO-8601
  content?: string;                 // For read operations
}
```

### Git Types

```typescript
interface GitStatus {
  branch: string;
  files: Array<{
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  }>;
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files?: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions?: number;
    deletions?: number;
  }>;
}
```

## KV Key Patterns

### AUTH_KV (User Authentication)

| Key | Value | TTL |
|-----|-------|-----|
| `user:{userId}` | User object | 30 days |
| `user-alias:{oldUserId}` | newUserId | 30 days |
| `issues:{userId}` | Issue list | — |
| `favorites:{userId}` | Bookmarks | — |
| `github-username:{userId}` | GitHub login | — |

### SESSIONS_KV (Session State)

| Key | Value | TTL |
|-----|-------|-----|
| `session:{sessionId}` | Session object | — |
| `message:{sessionId}:{msgId}` | Message object | — |
| `user-secrets:{userId}` | Env var object | — |
| `user-ai-providers:{userId}` | Provider array | — |
| `user-mcp:{userId}` | MCP server array | — |
| `user-plugins:{userId}` | Plugin array | — |
| `user-config:{userId}:rules` | CLAUDE.md content | — |
| `user-config:{userId}:commands` | Commands JSON | — |
| `user-config:{userId}:agents` | Agents JSON | — |
| `quickchat-list:{userId}` | Chat metadata | 7 days |
| `quickchat-msg:{userId}:{chatId}` | Message array | 7 days |

## NDJSON Stream Format (V1.5 Chat)

Each line is a JSON object representing an event from the container:

```json
{"type":"text-delta","text":"Here's "}
{"type":"text-delta","text":"some code"}
{"type":"tool-start","toolId":"123","name":"write_file","input":{"path":"/tmp/test.js"}}
{"type":"tool-result","toolId":"123","output":"File written"}
{"type":"artifact","language":"javascript","filename":"test.js","content":"console.log('hi')"}
{"type":"reasoning-delta","text":"Let me think..."}
{"type":"chain-of-thought","steps":[{"title":"Analysis","status":"complete"}]}
```

**Parsing:** Browser collects frames, buffers until pause, renders incrementally.

## Environment Variables (Container)

Injected by Worker into `startProcess()` options:

```
VF_SESSION_ID={sessionId}
VF_USER_ID={userId}
VF_CALLBACK_URL=https://worker/internal/stream
VF_CALLBACK_TOKEN={JWT}
VF_SESSION_MODE=agent|plan
VF_MODEL=sonnet|haiku|opus|etc
VF_AUTONOMY_MODE=off|on|turbo
IS_SANDBOX=1

# User config
CLAUDE_CODE_OAUTH_TOKEN={sk-ant-oat01-...}

# Project secrets (optional)
GITHUB_TOKEN={optional}
OP_SERVICE_ACCOUNT_TOKEN={optional}

# Environment from user secrets (unescaped)
{user-defined-vars}
```

**CRITICAL:** `options.env` replaces process.env — must spread `...process.env` first.

## Zod Schemas

**File:** `src/types.ts` (backend) + validation imports

- `SessionSchema` — Session validation
- `MessageSchema` — Message validation
- `SetupTokenRequestSchema` — OAuth token format
- `ChatRequestSchema` — Chat POST body
- `WSMessageSchema` — WebSocket discriminated union
- Zod used throughout for request/response validation

## R2 File Metadata

Files stored in FILES_BUCKET with custom metadata:

```typescript
customMetadata?: {
  originalName: string;
  uploadedBy: string;
  uploadedAt: string;
}
```

**Immutable:** Files cached for 1 year (Content-Cache-Control).
