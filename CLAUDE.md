# VaporForge - Claude Code Context

## Project Overview

Web-based Claude Code IDE on Cloudflare Sandboxes. Access Claude from any device using your existing Pro/Max subscription.

- **Live**: https://vaporforge.dev (app at /app/, landing at /)
- **Version**: 0.30.0
- **Repo**: Aventerica89/vaporforge

## MANDATORY RULES

1. **NEVER use Anthropic API keys for authentication.** Auth uses setup-token flow (OAuth tokens `sk-ant-oat01-*`), not API keys.
2. **OAuth tokens do NOT work with `@ai-sdk/anthropic` in CF Workers.** QuickChat, Code Transform, and Analyze features require explicit API keys (`sk-ant-api01-*`) stored in user secrets. Only sandbox sessions use OAuth tokens (passed to Claude SDK inside the container). NOTE: OAuth tokens DO work with `@anthropic-ai/sdk` in Node.js via `authToken` — this is a CF Workers / `@ai-sdk/anthropic` limitation, not a universal Anthropic API restriction.
3. **NEVER run `build:ui` alone.** Always use `npm run build` (runs build:info + build:landing + build:ui + build:merge). Running only build:ui leaves stale code in `dist/`.
4. **`ui/src/components/playground/` is READ-ONLY — NEVER MODIFY.** This directory is the canonical UI/UX source of truth. You may ONLY use `Read` on these files. Never `Edit`, `Write`, or run any `Bash` command that touches them. The playground is protected until the user explicitly lifts this restriction. To replicate playground UI into live components: read it, copy it verbatim, wire up real store/state in the destination file only.

5. **NEVER suggest removing or relaxing the playground READ-ONLY rule (rule 4).** Do not propose, hint, or imply that it should be lifted. It is permanent until the user explicitly states otherwise in this session.

## Architecture

```
Browser <-> Worker (Hono, auth, orchestration)
              |
              ├── [Default] WebSocket tunnel ──> Sandbox Container (ws-agent-server.js:8765)
              |                                      └── spawns claude-agent.js -> Claude SDK -> Anthropic API
              |
              ├── [V1.5 flag] POST /chat ──> ChatSessionAgent DO ──> startProcess in Container
              |                                   ↑                        |
              |                                   └── HTTP POST /internal/stream (NDJSON callback)
              |
              └── AI SDK (direct API) ──> Anthropic / Gemini APIs
                  (QuickChat, Transform, Analyze, CommitMsg)
```

**Default chat uses WebSocket streaming** (v0.20.0+). One WS connection per message, proxied through `sandbox.wsConnect(request, 8765)`. The container runs `ws-agent-server.js` which spawns `claude-agent.js` per query and pipes stdout as WS frames.

**V1.5 HTTP Streaming** (feature-flagged, `useV15` toggle in Account > Experimental). Routes chat through a `ChatSessionAgent` Durable Object instead of direct WS. The DO spawns `claude-agent.js` via `startProcess`, and the container streams NDJSON back to the DO via an HTTP POST to `/internal/stream` (authenticated with a per-execution JWT). The DO pipes events through to the browser's HTTP response. Enables walk-away persistence and crash recovery (container output collected by DO while browser is away).

### Monorepo Structure

| Directory | Purpose |
|-----------|---------|
| `src/` | Cloudflare Worker backend (Hono routes, auth, services) |
| `ui/` | React 18 + Vite + Tailwind v3.4 frontend SPA |
| `landing/` | Astro marketing site (merged into dist/ at build) |
| `scripts/` | Build-time generators (build-info, plugin catalog, merge-dist) |
| `Dockerfile` | Sandbox container image (Claude SDK + MCP + WS server) |

### Key Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `SESSIONS` | Durable Object | Session persistence (SQLite-backed) |
| `CHAT_SESSIONS` | Durable Object | V1.5 HTTP streaming bridge (ChatSessionAgent) |
| `SANDBOX_CONTAINER` | Container | Claude SDK runtime (standard-3: 2 vCPU, 8 GiB) |
| `AUTH_KV` | KV | User records, plugin config, AI provider settings |
| `SESSIONS_KV` | KV | Chat history, secrets, VF rules, MCP configs, issue tracker |
| `FILES_BUCKET` | R2 | VaporFiles persistent storage |

## Auth Flow

1. User runs `claude setup-token` locally, pastes token into login form
2. Backend validates via `POST https://api.anthropic.com/v1/oauth/token`
3. On success: creates user record in KV, issues session JWT
4. Token stored per-user in KV, session JWT in browser localStorage
5. Subsequent requests use JWT; Claude token refreshed server-side

## Development

```bash
npm run dev          # Start Worker (wrangler dev)
npm run dev:ui       # Start UI dev server (separate terminal)
npm run dev:landing  # Start landing page dev server
npm run build        # Full build: info + landing + UI + merge
npm run deploy       # Build + deploy to Cloudflare
npm run typecheck    # TypeScript check
npm run test         # Vitest tests
```

## Key Files

### Backend (src/)

| File | Purpose |
|------|---------|
| `src/router.ts` | All API route registration + health endpoint |
| `src/auth.ts` | Setup-token validation, JWT, token refresh |
| `src/sandbox.ts` | Container lifecycle, file/agent/credential injection, WS proxy, agency setup |
| `src/container.ts` | Sandbox DO class, WebSocket upgrade + proxy |
| `src/config-assembly.ts` | Assembles SandboxConfig from KV (MCP, secrets, plugins, creds) |
| `src/types.ts` | Shared TypeScript types + Zod schemas |
| `src/services/ai-provider-factory.ts` | Multi-provider model creation (Claude + Gemini) |
| `src/services/ai-schemas.ts` | Zod schemas for structured AI output |
| `src/services/agency-inspector.ts` | Browser-side inspector + container-side injection scripts |
| `src/services/agency-validator.ts` | Agency site validation |
| `src/services/embeddings.ts` | Embedding generation service |
| `src/services/files.ts` | File operations service |
| `src/agents/chat-session-agent.ts` | V1.5 Durable Object — HTTP streaming bridge, container dispatch, JWT callback |
| `src/utils/jwt.ts` | Execution token signing/verification for V1.5 container callback |
| `src/api/sdk.ts` | Main chat — WS proxy to container agent + persist endpoint + replay (stream reconnect) |
| `src/api/sessions.ts` | Session CRUD, sandbox create/resume |
| `src/api/agency.ts` | Agency mode API (create site, poll status, preview proxy) |
| `src/api/chat.ts` | Chat history endpoints |
| `src/api/mcp.ts` | MCP server CRUD, ping, tool discovery, credential collection |
| `src/api/secrets.ts` | Per-user secret management |
| `src/api/quickchat.ts` | SSE streaming chat (AI SDK streamText) |
| `src/api/transform.ts` | Code transform streaming |
| `src/api/analyze.ts` | Structured code analysis (streamText + Output.object) |
| `src/api/commit-msg.ts` | Smart commit message generation |
| `src/api/plugins.ts` | Plugin discovery from GitHub repos |
| `src/api/plugin-sources.ts` | Plugin source management |
| `src/api/user.ts` | VF rules, CLAUDE.md, user config endpoints |
| `src/api/config.ts` | App configuration endpoints |
| `src/api/vaporfiles.ts` | R2 file management |
| `src/api/issues.ts` | Issue tracker backend |
| `src/api/issues-routes.ts` | Issue tracker route definitions |
| `src/api/git.ts` | Git operations in container |
| `src/api/github.ts` | GitHub repo operations |
| `src/api/github-routes.ts` | GitHub route definitions |
| `src/api/favorites.ts` | User favorites logic |
| `src/api/favorites-routes.ts` | Favorites route definitions |
| `src/api/embeddings.ts` | Embedding API endpoints |
| `src/api/mcp-relay.ts` | WebSocket relay for local MCP servers |

### Frontend (ui/src/)

| File | Purpose |
|------|---------|
| `components/Layout.tsx` | Desktop layout (3-panel: sidebar, chat, editor) |
| `components/MobileLayout.tsx` | Mobile layout (viewportHeight-driven) |
| `components/ChatPanel.tsx` | Main chat UI + prompt input composition |
| `components/QuickChatPanel.tsx` | Quick AI chat slide-out (Cmd+Shift+Q) |
| `components/CodeTransformPanel.tsx` | Code transform with diff view (Cmd+Shift+T) |
| `components/CodeAnalysisPanel.tsx` | Structured analysis overlay (Cmd+Shift+A) |
| `components/SessionTabBar.tsx` | Horizontal session tabs |
| `components/SettingsPage.tsx` | Full-page settings (MCP, secrets, plugins, AI providers) |
| `components/Editor.tsx` | Monaco editor |
| `components/XTerminal.tsx` | xterm.js terminal |
| `components/IssueTracker.tsx` | Issue/task tracking panel |
| `components/McpRelayProvider.tsx` | Frontend MCP relay WebSocket manager |
| `components/agency/AgencyDashboard.tsx` | Agency mode site list + create flow |
| `components/agency/AgencyEditor.tsx` | Visual editor: iframe preview + component tree + edit panel |
| `components/agency/AgencyLoadingScreen.tsx` | Setup progress screen (clone, install, dev server) |
| `components/agency/ComponentTree.tsx` | Discovered component hierarchy sidebar |
| `components/agency/EditPanel.tsx` | Selected component edit instructions panel |
| `hooks/useAuth.ts` | Auth state (Zustand) |
| `hooks/useQuickChat.ts` | Quick chat state + SSE streaming |
| `hooks/useSandbox.ts` | Sandbox session state |
| `hooks/useWebSocket.ts` | WebSocket streaming for main chat |
| `hooks/useSmoothText.ts` | Typewriter buffer for streaming text |
| `hooks/useLayoutStore.ts` | Panel layout state (Zustand) |
| `lib/api.ts` | API client with JWT auth |
| `lib/types.ts` | Frontend TypeScript types |

## Agency Mode (v0.25.0)

Visual website editor — click components in a live Astro preview, describe edits in natural language, AI modifies the source.

### How It Works

1. User provides a GitHub repo URL containing an Astro site
2. `kickoffAgencySetup()` in `sandbox.ts`: clones repo, injects VF inspector, installs deps, starts dev server
3. Inspector injection (`agency-inspector.ts`):
   - **Browser-side**: `vf-inspector.js` written to `/workspace/public/`, runs in iframe. Discovers `data-vf-component` elements, highlights on hover (cyan), selects on click (purple), posts `vf-select`/`vf-deselect`/`vf-tree` messages to parent.
   - **Container-side**: Node script walks `.astro` files, adds `data-vf-component`/`data-vf-file` attributes to root elements, injects `<script is:inline src="/vf-inspector.js">` before `</head>`. Skips layout files (root `<html>`).
4. `AgencyEditor.tsx` renders iframe + listens for postMessage events
5. User clicks component in preview -> selects it -> types edit instruction -> sent to AI agent
6. Astro Dev Toolbar disabled via `ASTRO_DISABLE_DEV_OVERLAY=true` env var

### Agency Gotchas

- **`is:inline` REQUIRED on script tag** — without it, Astro's Vite compiler tries to bundle the static file as a module and silently drops it
- **Astro Dev Toolbar conflicts** — has its own Inspect mode + external links that break in sandboxed iframe. Disabled via env var.
- **External links blocked** — inspector intercepts clicks on `<a>` with external URLs to prevent iframe navigation
- **Auto-tagging fallback** — if no `data-vf-component` found, semantic elements (header, nav, main, section, etc.) are auto-tagged
- **Shadow DOM inspector regression (v0.27.0)** — `vf-highlight`/`vf-tooltip` custom elements. Fix `46b7db4` applied (static getter syntax + single-string cssText) but not verified in production. If inspector hover/click is broken, revert overlays in `agency-inspector.ts` to plain divs with `all:unset` + `!important` CSS overrides instead of Shadow DOM Web Components.

## Critical Gotchas

### SDK / Container

- **`IS_SANDBOX: '1'` env var REQUIRED** in container or CLI exits code 1
- **`options.env` REPLACES, not merges** — always spread `...process.env` first
- **`options.agents` REQUIRED for agent injection** — `settingSources` does NOT auto-discover agents from disk. Must parse .md files and pass as Record to `query()`.
- **Dockerfile uses `COPY` for scripts** — `COPY src/sandbox-scripts/file.js /opt/claude-agent/file.js`. Do NOT use heredocs (`RUN cat > file << 'EOF'`) — they require BuildKit which GH Actions / CF builders may lack.
- **Docker cache trap** — deploy workflow runs `docker builder prune --all -f` automatically. If deploying manually, prune first.
- **Container image "skipping push" trap** — if `wrangler deploy` says "Image already exists remotely, skipping push" but you changed the Dockerfile, Docker cached layers produced the same hash. Fix: `docker image prune -a -f && docker builder prune -a -f` then redeploy.
- **Container scripts MUST stay in sync** — `src/sandbox-scripts/*.js` is the source of truth. After editing ANY sandbox script: (1) update the file in `src/sandbox-scripts/`, (2) bump `VF_CONTAINER_BUILD` env in Dockerfile, (3) the `COPY` instructions in the Dockerfile will pick up the changes automatically.
- **AI SDK v6 stream events** — `text-delta` has `.text` property (not `.textDelta`). Same for `reasoning-delta`.
- **CF Sandbox `execStream()` is UNFIXABLE for streaming** — internal RPC buffering holds output until process exits. Use `sandbox.wsConnect(request, port)` for real-time WebSocket tunnel instead.

### Streaming (v0.20.0+)

- **Main chat uses WebSocket**, not SSE. One WS per message via `sandbox.wsConnect(request, 8765)`.
- **`ws-agent-server.js`** runs in container on port 8765, spawns `claude-agent.js` per query, pipes stdout as WS frames.
- **Context file pattern**: Worker writes secrets/config to `/tmp/vf-pending-query.json`, container reads + deletes.
- **`POST /api/sdk/persist`**: Browser saves full assistant text after stream completes (WS doesn't persist).
- **WS auth via query param** `?token=JWT` (WS upgrade requests can't carry custom headers from browser).
- **`emit()` helper in claude-agent.js**: `fs.writeSync(1, ...)` bypasses Node's block-buffered stdout.
- **Stream reconnect/replay**: Frontend generates `?msgId=UUID` per WS connection. Container buffers every chunk to `/tmp/vf-stream-{msgId}.jsonl` alongside sending it as a WS frame. On unexpected close (no prior `process-exit` frame), frontend calls `GET /api/sdk/replay/:sessionId?msgId=&offset=N` to recover the partial response. Buffer deleted on clean exit. `msgId` sanitized to `[a-zA-Z0-9-]{1,64}` before use in shell command.

### V1.5 HTTP Streaming (feature-flagged)

- **V1.5 route**: `POST /api/v15/chat` in `src/index.ts` — authenticates user, forwards body (including `userId`) to `ChatSessionAgent` DO.
- **`startProcess` env REPLACES container env** — must explicitly include `PATH`, `HOME`, `NODE_PATH`, `LANG`, `TERM` or the Claude CLI fails silently. This is the #1 gotcha.
- **OAuth token location**: Stored as `claudeToken` field inside user JSON at `user:{userId}` in `AUTH_KV`. NOT a separate `user:{userId}:token` key (this was the V1.5 launch bug).
- **`betas` array causes warnings for OAuth tokens** — `context-1m-2025-08-07` only works for API key users. Container-side `claude-agent.js` detects `sk-ant-oat` prefix and skips the beta.
- **Bridge timeout**: 5 minutes. If container never calls back to `/internal/stream`, the DO closes the browser's HTTP response with an error event.
- **Mode/model/autonomy threading**: Frontend sends `mode`, `model`, `autonomy` in POST body. Worker passes through to DO. DO must forward them as `VF_SESSION_MODE`, `VF_MODEL`, `VF_AUTONOMY_MODE` env vars in `startProcess`.
- **`/init` endpoint**: Called from session creation to persist `userId` in DO storage. Unauthenticated (internal-only). The `/chat` path also passes `userId` in the body as a more reliable source.

### MCP Servers

- **MCP configs stored in SESSIONS_KV** per user, injected into `~/.claude.json` at session start.
- **3 transport types**: `http` (direct URL), `stdio` (command in container), `relay` (browser-to-container WS tunnel).
- **Credential files**: Stored per-server, injected to container filesystem at configured paths. Paths auto-appended to CLAUDE.md so the agent knows they exist.
- **PUT /api/mcp/:name** for editing servers. **PUT /api/mcp/:name/toggle** for enable/disable.
- **Tool discovery**: `POST /api/mcp/:name/ping` sends JSON-RPC `tools/list` and caches results in KV.

### Build

- **Build pipeline**: `build:info` (git hash) -> `build:landing` (Astro) -> `build:ui` (Vite) -> `build:merge` (combine into dist/)
- **Wrangler deploys from `dist/`** — never from `ui/dist/` directly
- **`npx wrangler deploy`** preferred over `wrangler deploy` (avoids hangs)

### Mobile (iOS)

- Root CSS: `html, body { height: 100dvh; overflow: hidden; overscroll-behavior: none }`
- NO `position: fixed` on html/body — blocks browser keyboard handling
- Use flexbox for layout (`h-full`, `flex-1 overflow-y-auto`) — let the browser handle keyboard
- `useKeyboard()` hook only for detecting keyboard state (tab bar hiding), NOT for layout sizing
- `scrollIntoView({ behavior: 'smooth' })` is safe and recommended for scroll anchoring

### PromptInput Ownership Model

`PromptInput`'s form element has no base visual styles — it renders as `relative` only. All visual styling (border, background, rounded corners, shadow, blur) is owned by the `className` prop passed by the parent (`ChatPanel`, `QuickChatPanel`, etc.). Never add base styles back to `PromptInput.tsx`; put them in the consumer.

### MessageContent prompt-kit Components

`MessageContent.tsx` `renderPart()` uses prompt-kit components for rich stream rendering:
- `Reasoning` — auto-opens during stream, collapses on complete
- `Tool` — shows `input-streaming` state on `tool-start`, transitions to `output-available` when matching `tool-result` part is found by `part.toolCallId` lookup
- `CodeBlockWithCopy` — used for all artifact/code block output
- `Steps` + `TextShimmer` — used for chain-of-thought sequences

The two-layer custom tool pattern (intercept `tool-start` by name, suppress `tool-result`) still applies for VF-specific tools like `create_plan` and `ask_user_questions`.

### Custom Tool UI

Tools added to the main chat session use a two-layer pattern:

1. **Dockerfile `buildOptions()`**: Add tool definition to `vfTools` object (description + `inputSchema` + `execute` that returns an ack string). Both `create_plan` and `ask_user_questions` live here.
2. **`MessageContent.tsx` `renderPart()`**: Intercept `case 'tool-start':` by `part.name` before falling through to `<ToolCallBlock>`. Suppress matching `case 'tool-result':` (return `null`) — UI is already rendered.
3. **Hook access in `renderPart`**: `renderPart` is a free function — it cannot call hooks. If the tool's UI component needs store access (e.g., `sendMessage`), create a wrapper React component that calls the hook internally, then render the wrapper from `renderPart`. Example: `AskQuestionsBlock` wraps `QuestionFlow` and reads `sendMessage` from `useSandboxStore`.

QuickChat tools (AI SDK `tool()` in `src/api/quickchat.ts`) follow the same naming convention but are rendered in `QuickChatPanel.tsx` instead.

### UX

- **Right-side controls rule**: All close/exit buttons and action controls go on the RIGHT side of headers. Title and info go on the LEFT. Pattern: `justify-between` with title-left, actions+close-right. Reference: IssueTracker.tsx header.

### Files / Upload

- `sandbox.writeFile()` crashes on large payloads (>~500KB) — use 8KB chunked exec
- Use `base64 -d` pipe for binary decode, never `node -e` (shell escaping breaks)
- R2 `list()` needs explicit `include: ['customMetadata']` with compat_date >= 2022-08-04
