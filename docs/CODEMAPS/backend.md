# VaporForge Backend Codemap

**Last Updated:** 2026-03-14 (rev 4)

## Entry Points

- `src/index.ts` — Main worker handler (fetch, scheduled cleanup)
- `src/router.ts` — Hono API router with all protected routes

## Route Structure

### Auth (Public, Rate-Limited)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/setup` | POST | Setup-token to JWT exchange (OAuth) |
| `/api/auth/recover-by-token` | POST | Migrate data from old OAuth token |

### Main Chat (V1.5 HTTP Streaming)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/v15/chat` | POST | Browser initiates chat (ChatSessionAgent DO); IDOR-checked against session owner |
| `/internal/stream` | POST | Container HTTP callback (legacy fallback); JWT in `Authorization` header |
| `/internal/container-ws` | WS | Container WS tunnel (primary); JWT in `?token=` query param; real-time per-token frames |
| `/api/v15/resume` | GET | Resume disconnected stream from buffer; IDOR-checked against session owner |
| `/api/v15/approve` | POST | Browser submits tool approval; IDOR-checked against session owner |

### SDK (Legacy WebSocket)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sdk/ws` | WS | WebSocket upgrade → SessionDurableObject |
| `/api/sdk/stream` | POST | Progressive streaming (old route) |

### AI Endpoints (SSE/Direct)

| Route | Purpose | Auth | Output |
|-------|---------|------|--------|
| `/api/quickchat/*` | Chat with streaming | JWT | SSE text-delta (padded to >1KB/chunk) |
| `/api/transform/*` | Code transform diff | JWT | SSE structured |
| `/api/analyze/*` | Code analysis | JWT | SSE structured |
| `/api/commit-msg/*` | Generate commit msg | JWT | SSE structured |

### Session Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions` | GET | List user sessions |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id` | PUT | Update session (status, metadata) |
| `/api/sessions/:id` | DELETE | Delete session |
| `/api/sessions/:id/resume` | POST | Resume sleeping sandbox |
| `/api/sessions/:id/heartbeat` | POST | Keep workspace alive |

### File Operations

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/files` | POST | List directory or read file |
| `/api/files` | PUT | Create/overwrite file |
| `/api/files/:id` | DELETE | Delete file |
| `/api/sdk/watch/:sessionId` | GET | SSE file watcher |

### Chat History

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | GET | List messages for session |
| `/api/chat` | POST | Save message (after stream) |
| `/api/chat/:messageId` | DELETE | Delete message |

### MCP Servers

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/mcp` | GET | List user's MCP servers |
| `/api/mcp/:name` | GET | Get server config |
| `/api/mcp/:name` | PUT | Create/update server |
| `/api/mcp/:name` | PATCH | Partial update (mode, scope) |
| `/api/mcp/:name` | DELETE | Delete server |
| `/api/mcp/ping` | POST | Batch health-check all enabled HTTP servers (OAuth Bearer injection) |
| `/api/mcp/:name/ping` | POST | Single server health-check + tool discovery (OAuth Bearer injection) |
| `/api/mcp/:name/toggle` | PUT | Enable/disable server |
| `/api/mcp/:name/oauth/start` | GET | Initiate PKCE OAuth flow (for OAuth-protected servers) |
| `/api/mcp/:name/oauth` | DELETE | Revoke stored OAuth tokens |
| `/api/mcp-oauth/callback` | GET | OAuth callback endpoint (public, no auth) |

### Plugins & Plugin Sources

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plugins` | GET | List installed plugins |
| `/api/plugins/:id` | PUT | Install plugin |
| `/api/plugins/:id` | DELETE | Uninstall plugin |
| `/api/plugin-sources` | GET | List plugin repositories |
| `/api/plugin-sources` | POST | Add custom source |
| `/api/plugin-sources/:id` | DELETE | Remove source |

### User Config & Secrets

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/rules` | GET | Get CLAUDE.md rules |
| `/api/user/rules` | PUT | Update CLAUDE.md |
| `/api/user/claude-md` | GET | Get full CLAUDE.md content |
| `/api/secrets` | GET | List secret names |
| `/api/secrets/:name` | PUT | Save secret (encrypted in KV) |
| `/api/secrets/:name` | DELETE | Delete secret |

### AI Providers

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai-providers` | GET | List configured providers |
| `/api/ai-providers/:provider` | PUT | Set API key for provider |
| `/api/ai-providers/:provider` | DELETE | Remove API key |

### Other Endpoints

| Route | Purpose |
|-------|---------|
| `/api/git` | Git operations (status, commit, push, etc.) |
| `/api/github` | GitHub repo operations |
| `/api/agency` | Agency mode (visual editor setup) |
| `/api/issues` | Issue tracker backend |
| `/api/favorites` | Bookmarked files/sessions |
| `/api/vaporfiles` | R2 file upload/download |
| `/api/user-components` | Reusable component library |
| `/api/checkpoints` | Session checkpoints/snapshots |
| `/api/billing` | Stripe webhook + usage info |
| `/api/config` | App configuration endpoints |
| `/api/embeddings` | Semantic search preparation |
| `/api/health` | Server health check |

## Durable Objects

### ChatSessionAgent (`src/agents/chat-session-agent.ts`)

- **Purpose:** V1.5 HTTP streaming bridge, stream persistence, sentinel keepalive, tool approval workflow
- **Methods:**
  - `fetch()` — Router for /chat (HTTP), /internal/stream (legacy), /internal/container-ws (WS), /internal/approval, /approve, /init, /sentinel/start, /sentinel/stop, /chat/resume
  - `alarm()` — Periodic keepalive ping (every 8 min) to reset container idle timer
  - `handleChatHttp()` — Create NDJSON stream response, dispatch container, pipe response
  - `handleContainerWsUpgrade()` — Accept container WS upgrade, tag socket `container:{executionId}`, set up bridges
  - `handleContainerWsMessage()` — Receive WS frames from container, route to browser WS or buffer to storage
  - `pipeToHttpBridge()` — Stream container NDJSON to browser HTTP response (legacy fallback path)
  - `pipeToWsBridge()` — Stream container NDJSON to browser via WS (primary path)
  - `handleOrphanedStream()` — DO was evicted mid-stream; buffer remaining container output for recovery
  - `handleContainerStream()` — Accept chunked HTTP POST callback from container (legacy, replaced by WS)
  - `handleResume()` — Serve buffered NDJSON lines from given offset (reconnect after disconnect)
  - `storeLine()` — Buffer NDJSON line to DO SQLite for replay (rolling 2000-line window)
  - `clearBuffer()` — Clear old buffer before new chat request
  - `startSentinel()` — Start keepalive sentinel for a sandbox (schedules DO alarm)
  - `stopSentinel()` — Stop keepalive sentinel (deletes stored sandboxId, cancels alarm)

### SessionDurableObject (`src/websocket.ts`)

- **Purpose:** Legacy WS proxy, MCP relay, file watchers
- **Methods:**
  - `fetch()` — Handle WebSocket upgrades, WS message routing
  - `handleMcpRelay()` — Proxy MCP server messages (HTTP/stdio)
  - `watchFiles()` — SSE stream of file change events

## Config Assembly

**File:** `src/config-assembly.ts`

Assembles per-session SandboxConfig from KV stores:
- User OAuth token (from AUTH_KV user record)
- MCP servers (from SESSIONS_KV `user-mcp:${userId}`)
- User secrets (from SESSIONS_KV `user-secrets:${userId}`)
- Plugins (agents, commands, rules) → `.claude/` directory
- Global VF rules → prepended to CLAUDE.md
- Git repo + branch (from Session metadata)

**Output:** SandboxConfig object passed to container startup.

## Key Classes & Functions

| Module | Exports |
|--------|---------|
| `src/auth.ts` | AuthService, extractAuth(), verifyJWT() |
| `src/sandbox.ts` | SandboxManager, collectProjectSecrets(), collectUserSecrets() |
| `src/utils/jwt.ts` | signExecutionToken(), verifyExecutionToken() |
| `src/utils/validate-npm-package.ts` | isValidNpmPackageName() — shell injection guard for MCP install |
| `src/services/ai-provider-factory.ts` | createModel(), getProviderCredentials() |
| `src/services/embeddings.ts` | searchEmbeddings(), generateEmbeddings() |
| `src/services/files.ts` | FileService (getFile, uploadFile, etc.) |
| `src/services/agency-inspector.ts` | getInjectionScript(), getInspectorScript() |

## Environment Variables (Env Interface)

```typescript
interface Env {
  ENVIRONMENT: 'development' | 'production';
  JWT_SECRET: string;
  OP_SERVICE_ACCOUNT_TOKEN?: string;
  GITHUB_TOKEN?: string;
  VF_CONTAINER_BUILD: string;

  // Bindings
  Sandbox: SandboxNamespace;
  AUTH_KV: KVNamespace;
  SESSIONS_KV: KVNamespace;
  FILES_BUCKET: R2Bucket;
  SESSIONS: DurableObjectNamespace;
  CHAT_SESSIONS: DurableObjectNamespace;
  ASSETS: AssetsFetch;
}
```

## Security

- **IDOR protection on V1.5 endpoints:** `/api/v15/chat`, `/api/v15/approve`, and `/api/v15/resume` each verify `session.userId === user.id` before routing to the ChatSessionAgent DO. Returns 403 Forbidden on mismatch. Plus Worker validates before routing (double-check).
- **WS auth:** JWT in `?token=` query param validated in Worker before routing to DO (prevents unauthorized DO wakes).
- **approvalId generation:** `crypto.randomUUID()` used in `claude-agent.js` for tool approval IDs (unguessable).
- **MCP shell injection guard:** `src/utils/validate-npm-package.ts` — `isValidNpmPackageName()` validates npm package names via regex before interpolating into shell commands during MCP plugin install. Rejects shell metacharacters and names >214 chars.
- **MCP OAuth:** Private/internal host detection in `detectOAuthRequirement()` and `fetchAuthServerMetadata()` prevents leaking internal services. HTTPS-only for external URLs.
- **OAuth state validation:** PKCE state stored in KV with 30-min TTL, deleted after use. Prevents state reuse/forgery.
- **QuickChat shell escaping:** `shellEscape()` in `src/api/quickchat.ts` wraps all sandbox exec arguments in single quotes.

## Rate Limiting

- **authRateLimit:** 10 requests/min per IP (auth endpoints)
- **aiRateLimit:** 100 requests/min per user (AI endpoints)

## Error Handling

- All routes return `ApiResponse<T>` with `{ success, error, data }`
- 401 on missing auth, 404 on not found, 400 on validation error
- Error messages exposed to frontend for user feedback
- Server-side errors logged with context for debugging
