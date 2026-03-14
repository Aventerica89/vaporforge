# VaporForge Architecture Codemap

**Last Updated:** 2026-03-14 (rev 4)

## High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (React 18 + Vite)                                       │
│ ├─ ChatPanel / QuickChatPanel / CodeTransformPanel              │
│ ├─ WebSocket (WS) and HTTP streaming consumers                  │
│ └─ Session management, auth state, sandbox interaction          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/WS
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (Hono Router)                                 │
│ ├─ Auth middleware + JWT validation                             │
│ ├─ API routes (/api/chat, /api/quickchat, /api/sdk)             │
│ ├─ WebSocket upgrade handler                                    │
│ └─ Durable Object coordination                                  │
└─────────────────────────────────────────────────────────────────┘
        ↓ HTTP                           ↓ DO + WS
┌──────────────────────┐       ┌──────────────────────────────┐
│ ChatSessionAgent DO  │       │ SessionDurableObject         │
│ (V1.5 HTTP bridge)   │       │ (Workspace, MCP relay)       │
│                      │       │                              │
│ - Streams NDJSON     │       │ - WS proxy to container      │
│ - Buffer replay      │       │ - MCP relay (HTTP/stdio)     │
│ - Sentinel keepalive │       │ - File change watchers       │
└──────────────────────┘       └──────────────────────────────┘
        ↓ WebSocket (real-time)           ↓ WS
┌──────────────────────────────────────────────────────────────────┐
│ Cloudflare Sandbox (Container)                                   │
│ ├─ claude-agent.js (Claude SDK, streaming agents)                │
│ ├─ MCP relay (local servers, HTTP tunnel)                        │
│ ├─ /workspace (git repo, files, terminal)                        │
│ └─ Idle termination after 10 minutes (keepalive sentinel resets) │
└──────────────────────────────────────────────────────────────────┘
        ↓ API calls
┌─────────────────┬────────────────┬──────────────────┐
│ Anthropic API   │ Google Gemini  │ OpenAI API       │
│ (Claude models) │ (Gemini models)│ (GPT-4/o3)       │
└─────────────────┴────────────────┴──────────────────┘

External Storage:
├─ AUTH_KV: User records, plugin config
├─ SESSIONS_KV: Chat history, MCP config, secrets, VF rules
├─ FILES_BUCKET (R2): Persistent file uploads
└─ Stripe: Billing webhooks
```

## Request Flows

### Main Chat (V1.5 HTTP Streaming with WS Container Tunnel)

1. Browser: `POST /api/v15/chat` with sessionId, prompt, mode, model, userId (body)
2. Worker: Validates user JWT + IDOR (session.userId === user.id), routes to ChatSessionAgent DO
3. DO: Signs execution JWT, builds `VF_WS_CALLBACK_URL` pointing to `/internal/container-ws`
4. DO: Calls `sandbox.startProcess()` with claude-agent.js + `VF_WS_CALLBACK_URL` env var
5. Container: claude-agent.js opens outbound WebSocket to `/internal/container-ws?token=JWT`
6. Worker: WS upgrade validated (JWT in `?token=` query param), routed to ChatSessionAgent DO
7. DO: `handleContainerWsUpgrade()` accepts WS, tags it `container:{executionId}`
8. Container: Sends NDJSON frames as WS text messages in real-time (no CF buffering)
9. DO: `handleContainerWsMessage()` buffers frames + pipes to browser HTTP response
10. Browser: Receives NDJSON frames in real-time, parses + renders

**Why WebSocket over HTTP POST callback:** CF's Durable Object HTTP request handler buffers the entire response before dispatching, making chunked HTTP POST useless for real-time streaming. WebSocket frames are delivered immediately per-message.

**Persistence:** DO buffers stream in SQLite (rolling 2000-line window) for replay on disconnect.
**Keepalive:** DO alarm fires every 8 min to ping sandbox, resetting idle timer. Starts on first message, stops on session sleep/delete.

**Legacy HTTP callback path** (`VF_CALLBACK_URL` / `/internal/stream`) is retained as fallback. If `VF_WS_CALLBACK_URL` is not set, claude-agent.js falls back to the chunked POST path.

**Tool approval workflow:** Container emits `{"type":"tool-approval-request","toolId":"...","approvalId":"..."}` frame. DO stores resolver callback, browser polls `/internal/approval/{approvalId}` until resolution, then submits to `POST /approve` on the DO.

### Quick Chat & AI Endpoints (AI SDK Direct)

- `POST /api/quickchat` → AI SDK `streamText()` → browser SSE
- `POST /api/transform` → Code transformation with structured output
- `POST /api/analyze` → Code analysis with `Output.object()`
- `POST /api/commit-msg` → Commit message generation

These use direct API keys (not OAuth tokens) for Cloudflare Workers.

**SSE Chrome buffering fix:** `padStreamLines()` in `src/api/quickchat.ts` pads each SSE event to >1KB and appends `\n\n` in a single write, ensuring Chrome's `ReadableStream` threshold is exceeded per chunk for immediate delivery. Without this, Chrome buffers all events and delivers them in one batch at stream end (pop-in).

**Frontend smoothing:** `useSmoothText` drips padded text at 4–15 chars/frame via `requestAnimationFrame`. The `isMidAnimation` guard applies 3x catch-up only when cursor > 0 and streaming has ended (finishing a near-complete response). When cursor = 0 (all text arrived post-tool-use), uses 1.5x so animation remains visible. `StreamingTextPart` in `QuickChatPanel.tsx` wraps this hook per text part.

**Streaming linger:** After stream ends (isStreaming → false), `streamingParts` remain populated for lingerMs (default 300ms). This lets `useSmoothText` complete its animation. Frontend checks `hasContent = !!(streamingContent || streamingParts.length > 0)` to render the streaming message while lingering.

### SDK WebSocket (Legacy)

- `GET /api/sdk/ws?token=JWT` → SessionDurableObject
- Routes to container's port 8765 (ws-agent-server.js)
- Spawns claude-agent.js per query, pipes WS frames

## Storage Layer

| Binding | Type | Purpose |
|---------|------|---------|
| `AUTH_KV` | KV | User records (ID, email, OAuth token, TTL=30d) |
| `SESSIONS_KV` | KV | Chat messages, MCP config, user secrets, VF rules |
| `FILES_BUCKET` | R2 | Persistent file uploads (immutable, 1-year cache) |
| `SESSIONS` | Durable Object | Per-session WS + MCP relay + file watchers |
| `CHAT_SESSIONS` | Durable Object | V1.5 HTTP bridge + sentinel keepalive |

## Bindings (wrangler.toml)

```
Env Variables:
├─ ENVIRONMENT: 'development' | 'production'
├─ JWT_SECRET: Session token signing key
├─ VF_CONTAINER_BUILD: Docker image version stamp

Cloudflare Services:
├─ Sandbox: Container runtime (@cloudflare/sandbox)
├─ AUTH_KV: User + auth data (TTL: 30 days)
├─ SESSIONS_KV: Session state, config, secrets
├─ FILES_BUCKET: R2 bucket for file storage
├─ SESSIONS: Durable Object namespace (workspace proxy)
├─ CHAT_SESSIONS: Durable Object namespace (V1.5 HTTP bridge)
└─ ASSETS: Static assets (SPA)
```

## Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| **AuthService** | src/auth.ts | Setup-token validation, JWT, token refresh |
| **SandboxManager** | src/sandbox.ts | Session lifecycle, config injection, container wakeup |
| **AiProviderFactory** | src/services/ai-provider-factory.ts | Multi-provider model creation (Claude, Gemini, OpenAI) |
| **EmbeddingsService** | src/services/embeddings.ts | Semantic search, embedding generation |
| **FileService** | src/services/files.ts | R2 operations, download, metadata |
| **AgencyInspector** | src/services/agency-inspector.ts | Browser + container-side component tagging |

## Security Architecture

- **IDOR protection:** `/api/v15/chat`, `/api/v15/approve`, `/api/v15/resume` all verify `session.userId === user.id` before routing to ChatSessionAgent DO. Returns 403 on mismatch. Prevents cross-user prompt injection and tool approval spoofing.
- **Tool approval IDs:** Generated with `crypto.randomUUID()` in `claude-agent.js`. Unguessable; prevents approval replay/forgery.
- **MCP shell injection guard:** `isValidNpmPackageName()` in `src/utils/validate-npm-package.ts` validates npm package names via allowlist regex before interpolating into `npm install` shell commands. Rejects all shell metacharacters.
- **Container exec escaping:** `shellEscape()` wraps all user-supplied args passed to `execInSandbox()` in single-quoted strings with embedded single-quote escaping.

## Version & Deployment

- **Current Version:** 0.26.0 (see src/router.ts)
- **Build:** `npm run build` → wrangler deploy
- **Build Pipeline:** build-info → build-landing → build-ui → build-merge
- **Output:** dist/ (SPA + assets merged)
