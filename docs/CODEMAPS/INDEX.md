# VaporForge Codemaps Index

**Last Updated:** 2026-03-12 (rev 3)

## Overview

VaporForge is a web-based Claude Code IDE on Cloudflare Sandboxes. This documentation provides architectural maps of the codebase organized by area.

**Key Technologies:**
- **Backend:** Cloudflare Workers (Hono), Durable Objects, R2 storage
- **Frontend:** React 18, Vite, Tailwind CSS v3.4
- **Container:** Claude SDK, MCP servers, Node.js runtime
- **Auth:** OAuth token exchange (setup-token flow)
- **AI:** Multi-provider support (Claude, Gemini, OpenAI)

## Codemaps

### [architecture.md](./architecture.md)
High-level system design, request flows, data flows, deployment pipeline.

**Key Sections:**
- System diagram (browser → Worker → ChatSessionAgent DO → Container)
- Main chat flow (V1.5 HTTP streaming with persistence)
- Quick chat & AI endpoints (AI SDK direct calls)
- Storage layer (AUTH_KV, SESSIONS_KV, R2, Durable Objects)
- Key services and their responsibilities

**Read this for:** Understanding how the system fits together, request routing, deployment architecture.

### [backend.md](./backend.md)
Cloudflare Worker API routes, Durable Objects, config assembly, auth flow.

**Key Sections:**
- All API routes organized by feature area
- Route signatures (method, purpose, auth requirement)
- ChatSessionAgent DO (V1.5 HTTP bridge, stream persistence)
- SessionDurableObject (legacy WS proxy, MCP relay, file watchers)
- Config assembly process (secrets, MCP, plugins, rules)
- Key classes and functions
- Environment variables
- Rate limiting & error handling

**Read this for:** Understanding API routes, implementing new endpoints, modifying auth flow, container lifecycle.

**Entry Points:**
- `src/index.ts` — Worker handler + scheduled cleanup
- `src/router.ts` — Hono router setup

### [frontend.md](./frontend.md)
React component structure, state management, UI patterns, styling.

**Key Sections:**
- Layout components (desktop, mobile, tabs)
- Main chat & message rendering (NDJSON frame types)
- AI panels (QuickChat, Transform, Analyze)
- Settings tabs (Secrets, MCP, Plugins, AI Providers, Rules)
- Agency mode (visual editor, component discovery)
- Zustand hooks (useSandbox, useAuth, useQuickChat, etc.)
- Streaming hooks (WebSocket, SSE, text smoothing)
- Type system (Session, Message, MessagePart, etc.)
- Component tree hierarchy
- Mobile-specific considerations (100dvh, no fixed, flexbox)

**Read this for:** Building UI components, understanding streaming, adding settings tabs, state management patterns.

**Entry Points:**
- `ui/src/main.tsx` — App bootstrap
- `ui/src/App.tsx` — Root component
- `ui/src/components/Layout.tsx` — Desktop layout

### [data.md](./data.md)
Type definitions, data models, schemas, storage patterns, NDJSON format.

**Key Sections:**
- Backend types (Session, Message, User, ApiResponse)
- Frontend types (Session, MessagePart, ChainOfThoughtStep)
- Configuration models (SandboxConfig, McpServerConfig, Plugin)
- KV key patterns (user, session, secrets, MCP, plugins)
- NDJSON stream format (text-delta, tool, artifact, reasoning, etc.)
- Container environment variables
- Zod schemas (validation)
- R2 file metadata

**Read this for:** Understanding data structures, implementing serialization, debugging KV storage, extending types.

**Reference Files:**
- `src/types.ts` — Backend types + Zod schemas
- `ui/src/lib/types.ts` — Frontend types
- `src/sandbox.ts` — SandboxConfig interface

## Quick Navigation

### Finding Something?

**API Routes:**
- See [backend.md](./backend.md) — Route Structure section
- Entry: `src/router.ts`

**Chat Streaming (Main):**
- See [architecture.md](./architecture.md) — V1.5 HTTP Streaming flow
- Files: `src/agents/chat-session-agent.ts`, `src/index.ts`

**Quick Chat / AI Endpoints:**
- See [backend.md](./backend.md) — AI Endpoints section
- Files: `src/api/quickchat.ts`, `src/api/transform.ts`, `src/api/analyze.ts`

**Message Rendering:**
- See [frontend.md](./frontend.md) — Message Parts section
- Files: `ui/src/components/chat/MessageContent.tsx`

**State Management:**
- See [frontend.md](./frontend.md) — State Management section
- Files: `ui/src/hooks/useSandbox.ts`, `ui/src/hooks/useAuth.ts`, etc.

**MCP Servers:**
- See [backend.md](./backend.md) — MCP Servers section
- Files: `src/api/mcp.ts`, `src/config-assembly.ts`

**Plugins:**
- See [backend.md](./backend.md) — Plugins & Plugin Sources section
- Files: `src/api/plugins.ts`, `src/api/plugin-sources.ts`

**Session Lifecycle:**
- See [architecture.md](./architecture.md) — Storage Layer section
- Files: `src/api/sessions.ts`, `src/sandbox.ts`

**Auth Flow:**
- See [backend.md](./backend.md) — Auth section
- Files: `src/auth.ts`, `src/router.ts` (setup endpoint)

**Container Startup:**
- See [data.md](./data.md) — Environment Variables section
- Files: `src/sandbox.ts`, `src/config-assembly.ts`

**File Upload/Download:**
- See [backend.md](./backend.md) — File Operations section
- Files: `src/api/vaporfiles.ts`, `src/services/files.ts`

**Agency Mode (Visual Editor):**
- See [frontend.md](./frontend.md) — Agency Mode section
- Files: `ui/src/components/agency/`, `src/api/agency.ts`

**Mobile Layout:**
- See [frontend.md](./frontend.md) — Mobile-Specific section
- Files: `ui/src/components/MobileLayout.tsx`

## Key Concepts

### V1.5 HTTP Streaming Architecture (with WS Container Tunnel)

Main chat uses **HTTP POST streaming** for the browser leg and a **WebSocket tunnel** for the container→DO leg. A ChatSessionAgent DO acts as the bridge:

1. Browser: `POST /api/v15/chat` with prompt
2. Worker: Routes to ChatSessionAgent DO
3. DO: Spawns container via `sandbox.startProcess()`, sets `VF_WS_CALLBACK_URL`
4. Container: claude-agent.js opens outbound WS to `/internal/container-ws`
5. Worker: Validates JWT (`?token=`), routes WS upgrade to same ChatSessionAgent DO
6. DO: Tags container WS socket, routes incoming frames to browser + replay buffer
7. **Persistence:** DO buffers stream in storage for reconnect/replay

The WS tunnel replaces the old chunked HTTP POST callback (`/internal/stream`). CF's DO HTTP handler buffers entire responses before delivering, breaking real-time streaming. WS frames are delivered immediately. The legacy HTTP path is retained as a fallback.

See [architecture.md](./architecture.md) for detailed flow.

### Durable Objects

- **ChatSessionAgent:** V1.5 HTTP bridge, stream buffering, sentinel keepalive
- **SessionDurableObject:** Legacy WebSocket proxy, MCP relay, file watchers

### Config Assembly

When a container starts, the Worker calls `config-assembly.ts` to build a **SandboxConfig** from:
- User OAuth token (from AUTH_KV)
- MCP servers (from SESSIONS_KV)
- Plugins (agents, commands, rules)
- User secrets (env vars)
- CLAUDE.md content
- VF internal rules

This config is then injected into the container at startup.

### Message Streaming (NDJSON)

Main chat sends structured frames as NDJSON:
- Each line is a JSON object
- Types: `text-delta`, `tool-start`, `tool-result`, `artifact`, `reasoning-delta`, etc.
- Browser buffers frames, renders progressively
- See [data.md](./data.md) for format spec

### Quick Chat & AI Endpoints

Unlike main chat (HTTP streaming), these use **AI SDK direct calls** with SSE:
- `POST /api/quickchat` → `ai.streamText()` → browser SSE
- Requires actual API keys (not OAuth tokens)
- Used for code transform, analysis, commit messages

## Development Workflow

### Adding a New API Route

1. Create `src/api/new-feature.ts` with Hono router
2. Add route to `src/router.ts` in `protectedRoutes.route()`
3. Define Zod schema in file or `src/types.ts`
4. Implement endpoint with error handling
5. Return `ApiResponse<T>`

### Adding a Component

1. Create `ui/src/components/YourComponent.tsx`
2. Import hooks (`useSandbox`, `useAuth`, etc.) as needed
3. Use Tailwind CSS for styling (no base styles)
4. Export from component barrel file if part of feature

### Adding a Settings Tab

1. Create `ui/src/components/settings/YourTab.tsx`
2. Add to tab list in `ui/src/components/SettingsPage.tsx`
3. Implement save logic (API calls via api.ts)
4. Use form components from `ui/src/components/ui/`

### Modifying Container Behavior

1. Edit `src/sandbox.ts` (SandboxManager, config assembly)
2. Or edit `src/config-assembly.ts` (config building)
3. Or edit Dockerfile + `src/sandbox-scripts/` (container startup)
4. Test with local session: `npm run dev`, create sandbox

### Adding New Message Part Type

1. Add to `MessagePart.type` union in `ui/src/lib/types.ts`
2. Add handler in `ui/src/components/chat/MessageContent.tsx` `renderPart()`
3. Add NDJSON frame type in container's claude-agent.js
4. Create UI component (e.g., `ui/src/components/ai-elements/YourPart.tsx`)

## Testing

- Backend tests: `src/**/__tests__/` (Vitest)
- Frontend tests: `ui/src/**/__tests__/` (Vitest + jsdom)
- Run: `npm run test`
- Coverage: 80% minimum

## Build & Deployment

```bash
npm run build        # Full pipeline: info → landing → UI → merge
npm run deploy       # Build + push to Cloudflare
```

Output goes to `dist/` (SPA + assets merged).

## File Structure Summary

```
/Users/jb/repos/vaporforge/
├─ src/                              # Backend
│  ├─ index.ts                       # Worker handler
│  ├─ router.ts                      # Hono router
│  ├─ auth.ts                        # Authentication
│  ├─ sandbox.ts                     # Container lifecycle
│  ├─ config-assembly.ts             # Config builder
│  ├─ types.ts                       # Type + schema definitions
│  ├─ agents/
│  │  └─ chat-session-agent.ts       # V1.5 HTTP bridge DO
│  ├─ api/                           # Route handlers
│  │  ├─ sdk.ts, chat.ts, quickchat.ts
│  │  ├─ sessions.ts, files.ts, mcp.ts
│  │  ├─ plugins.ts, agency.ts, etc.
│  │  └─ ...
│  ├─ services/                      # Business logic
│  │  ├─ ai-provider-factory.ts      # Multi-provider models
│  │  ├─ agency-inspector.ts         # Visual editor injection
│  │  ├─ embeddings.ts, files.ts
│  │  └─ ...
│  ├─ utils/                         # Utilities
│  │  ├─ jwt.ts                      # Token signing
│  │  ├─ rate-limit.ts, validate-url.ts
│  │  └─ ...
│  └─ websocket.ts                   # SessionDurableObject
│
├─ ui/src/                           # Frontend
│  ├─ main.tsx                       # App bootstrap
│  ├─ App.tsx                        # Root component
│  ├─ components/
│  │  ├─ Layout.tsx                  # Desktop layout
│  │  ├─ MobileLayout.tsx            # Mobile layout
│  │  ├─ ChatPanel.tsx               # Main chat
│  │  ├─ Editor.tsx                  # Code editor
│  │  ├─ chat/                       # Message components
│  │  ├─ settings/                   # Settings tabs
│  │  ├─ agency/                     # Visual editor
│  │  ├─ ai-elements/                # Rich rendering
│  │  └─ ui/                         # shadcn/ui components
│  ├─ hooks/                         # Zustand + utility hooks
│  │  ├─ useSandbox.ts               # Main session state
│  │  ├─ useAuth.ts, useQuickChat.ts
│  │  └─ ...
│  └─ lib/
│     ├─ types.ts                    # Frontend types
│     ├─ api.ts                      # API client
│     └─ ...
│
└─ docs/CODEMAPS/                    # This documentation
   ├─ INDEX.md (you are here)
   ├─ architecture.md
   ├─ backend.md
   ├─ frontend.md
   └─ data.md
```

## Next Steps

- Read the area-specific codemap for your feature
- Find the relevant entry point file
- Trace the data flow using the diagrams
- Refer to type definitions in [data.md](./data.md)
- Check existing patterns in the codebase before implementing
