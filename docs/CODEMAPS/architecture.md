# VaporForge Architecture Codemap

**Last Updated:** 2026-03-11

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
        ↓ Callback                        ↓ WS
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

### Main Chat (V1.5 HTTP Streaming)

1. Browser: `POST /api/v15/chat` with sessionId, prompt, mode, model
2. Worker: Validates JWT, routes to ChatSessionAgent DO
3. DO: Calls `sandbox.startProcess()` with claude-agent.js
4. Container: claude-agent.js streams NDJSON to `/internal/stream` callback
5. Worker: Pipes container stream to browser HTTP response
6. Browser: Receives NDJSON frames in real-time, parses + renders

**Persistence:** DO buffers stream to storage for replay on disconnect.
**Keepalive:** DO alarm fires every 8 min to ping sandbox, resetting idle timer.

### Quick Chat & AI Endpoints (AI SDK Direct)

- `POST /api/quickchat` → AI SDK `streamText()` → browser SSE
- `POST /api/transform` → Code transformation with structured output
- `POST /api/analyze` → Code analysis with `Output.object()`
- `POST /api/commit-msg` → Commit message generation

These use direct API keys (not OAuth tokens) for Cloudflare Workers.

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

## Version & Deployment

- **Current Version:** 0.26.0 (see src/router.ts)
- **Build:** `npm run build` → wrangler deploy
- **Build Pipeline:** build-info → build-landing → build-ui → build-merge
- **Output:** dist/ (SPA + assets merged)
