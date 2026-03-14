# VaporForge - Claude Code Context

## Project Overview

Web-based Claude Code IDE on Cloudflare Sandboxes. Access Claude from any device using your existing Pro/Max subscription.

- **Live**: https://vaporforge.dev (app at /app/, landing at /)
- **Version**: 0.30.0
- **Repo**: Aventerica89/vaporforge

## Architecture Reference

`docs/CODEMAPS/` contains token-lean structural maps (updated 2026-03-11):
- `INDEX.md` — start here, navigation guide
- `architecture.md` — request flows, DO wiring
- `backend.md` — all API routes and services
- `frontend.md` — components, hooks, state
- `data.md` — types, KV key patterns, stream frames

Load these instead of re-reading source files for orientation.

**For technology docs**, use the `/cli` skill to access local llms.txt files (Cloudflare, Vercel AI SDK, Docker, Anthropic Agent SDK). These are faster and don't require network fetches. Claude.com does not publish llms.txt — use `docs.claude.com` or `platform.claude.com` via Context7 for Anthropic-specific docs.

## MANDATORY RULES

1. **NEVER use Anthropic API keys for authentication.** Auth uses setup-token flow (OAuth tokens `sk-ant-oat01-*`), not API keys.
2. **OAuth tokens do NOT work with `@ai-sdk/anthropic` in CF Workers.** QuickChat, Code Transform, and Analyze features require explicit API keys (`sk-ant-api01-*`) stored in user secrets. Only sandbox sessions use OAuth tokens (passed to Claude SDK inside the container). NOTE: OAuth tokens DO work with `@anthropic-ai/sdk` in Node.js via `authToken` — this is a CF Workers / `@ai-sdk/anthropic` limitation, not a universal Anthropic API restriction.
3. **NEVER run `build:ui` alone.** Always use `npm run build` (runs build:info + build:landing + build:ui + build:merge). Running only build:ui leaves stale code in `dist/`.

## Architecture

```
Browser <-> Worker (Hono, auth, orchestration)
              |
              ├── POST /chat ──> ChatSessionAgent DO ──> startProcess in Container
              |                        ↑                        |
              |                        └── HTTP POST /internal/stream (NDJSON callback)
              |
              └── AI SDK (direct API) ──> Anthropic / Gemini APIs
                  (QuickChat, Transform, Analyze, CommitMsg)
```

**Main chat uses HTTP streaming via ChatSessionAgent DO.** The DO spawns `claude-agent.js` via `startProcess`, and the container streams NDJSON back to the DO via an HTTP POST to `/internal/stream` (authenticated with a per-execution JWT). The DO pipes events through to the browser's HTTP response. Enables walk-away persistence and crash recovery (container output collected by DO while browser is away).

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
| `Sandbox` | Container | Claude SDK runtime (standard-3: 2 vCPU, 8 GiB) |
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

See `docs/CODEMAPS/backend.md` and `docs/CODEMAPS/frontend.md` for full file listings. Read those instead of scanning `src/` directly.

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
- **NO `options.plugins`** — `plugins: [{ type: 'local', path }]` requires `.claude-plugin/plugin.json` manifest and crashes on AJV validation without it. Use `settingSources: ['project']` for filesystem discovery.
- **Plugin file path split (CRITICAL)** — `injectPluginFiles()` writes to two locations intentionally: commands+rules → `/workspace/.claude/commands|rules/` (scanned by `settingSources: ['project']`); agents → `/root/.claude/agents/` (loaded by `loadAgentsFromDisk()`). Never consolidate these — the CLI subprocess only finds slash commands in `/workspace/.claude/`, not `/root/.claude/`.
- **Dockerfile uses `COPY` for scripts** — `COPY src/sandbox-scripts/file.js /opt/claude-agent/file.js`. Do NOT use heredocs (`RUN cat > file << 'EOF'`) — they require BuildKit which GH Actions / CF builders may lack.
- **Docker cache trap** — deploy workflow runs `docker builder prune --all -f` automatically. If deploying manually, prune first.
- **Container image "skipping push" trap** — if `wrangler deploy` says "Image already exists remotely, skipping push" but you changed the Dockerfile, Docker cached layers produced the same hash. Fix: `docker image prune -a -f && docker builder prune -a -f` then redeploy.
- **Container scripts MUST stay in sync** — `src/sandbox-scripts/*.js` is the source of truth. After editing ANY sandbox script: (1) update the file in `src/sandbox-scripts/`, (2) bump `VF_CONTAINER_BUILD` env in Dockerfile, (3) the `COPY` instructions in the Dockerfile will pick up the changes automatically.
- **AI SDK v6 stream events** — `text-delta` has `.text` property (not `.textDelta`). Same for `reasoning-delta`.
- **CF Sandbox `execStream()` is UNFIXABLE for streaming** — internal RPC buffering holds output until process exits. Use `sandbox.wsConnect(request, port)` for real-time WebSocket tunnel instead.

### Streaming: Legacy WS Path (v0.20.0–v1.4)

> The V1.5 HTTP streaming path (ChatSessionAgent) is the **current primary path** for main chat. The WS path below is retained for replay/reconnect and may be used by older sessions.

- **Main chat (legacy) uses WebSocket**, not SSE. One WS per message via `sandbox.wsConnect(request, 8765)`.
- **`ws-agent-server.js`** runs in container on port 8765, spawns `claude-agent.js` per query, pipes stdout as WS frames.
- **Context file pattern**: Worker writes secrets/config to `/tmp/vf-pending-query.json`, container reads + deletes.
- **`POST /api/sdk/persist`**: Browser saves full assistant text after stream completes (WS doesn't persist).
- **WS auth via query param** `?token=JWT` (WS upgrade requests can't carry custom headers from browser).
- **`emit()` helper in claude-agent.js**: `fs.writeSync(1, ...)` bypasses Node's block-buffered stdout.
- **Stream reconnect/replay**: Frontend generates `?msgId=UUID` per WS connection. Container buffers every chunk to `/tmp/vf-stream-{msgId}.jsonl` alongside sending it as a WS frame. On unexpected close (no prior `process-exit` frame), frontend calls `GET /api/sdk/replay/:sessionId?msgId=&offset=N` to recover the partial response. Buffer deleted on clean exit. `msgId` sanitized to `[a-zA-Z0-9-]{1,64}` before use in shell command.

### HTTP Streaming (ChatSessionAgent)

- **Chat route**: `POST /api/v15/chat` in `src/index.ts` — authenticates user, forwards body (including `userId`) to `ChatSessionAgent` DO.
- **`startProcess` env REPLACES container env** — must explicitly include `PATH`, `HOME`, `NODE_PATH`, `LANG`, `TERM` or the Claude CLI fails silently. This is the #1 gotcha.
- **OAuth token location**: Stored as `claudeToken` field inside user JSON at `user:{userId}` in `AUTH_KV`. NOT a separate `user:{userId}:token` key (this was the V1.5 launch bug).
- **`betas` array causes warnings for OAuth tokens** — `context-1m-2025-08-07` only works for API key users. Container-side `claude-agent.js` detects `sk-ant-oat` prefix and skips the beta.
- **Bridge timeout**: 5 minutes. If container never calls back to `/internal/stream`, the DO closes the browser's HTTP response with an error event.
- **Mode/model/autonomy threading**: Frontend sends `mode`, `model`, `autonomy` in POST body. Worker passes through to DO. DO must forward them as `VF_SESSION_MODE`, `VF_MODEL`, `VF_AUTONOMY_MODE` env vars in `startProcess`.
- **`/init` endpoint**: Called from session creation to persist `userId` in DO storage. Unauthenticated (internal-only). The `/chat` path also passes `userId` in the body as a more reliable source.
- **Chrome Fetch ReadableStream buffering**: Chrome buffers HTTP chunks smaller than ~1KB before delivering to `reader.read()`. Each `bridge.writer.write()` call in `handleContainerStream` pads writes with `' '.repeat(1024) + '\n'` to force immediate delivery. The padding line is whitespace-only; `streamV15`'s `if (!line.trim()) continue` skips it.
- **SSE `\n\n` separators are required independently of the 1KB pad**: `EventSourceParserStream` needs a blank line after each `data:` line to dispatch an event. Stripping or omitting `\n\n` (even in chunks >1KB) causes all events to accumulate and fire at EOF. The QuickChat `padStreamLines()` transformer incorporates `\n\n` into each padded chunk so the separator is never a separate tiny chunk — both requirements are satisfied at once.
- **`useSmoothText` is the streaming animation layer**: `hooks/useSmoothText.ts` runs a `requestAnimationFrame` loop that advances a cursor through accumulated text at 4–15 chars/frame. It MUST be used for streaming text — without it, React 18's automatic batching causes all tokens to pop in at once. Wired in `MessageContent.tsx` for the streaming `case 'text'` path and in `QuickChatPanel.tsx`.
- **`useSmoothText` catch-up speed guard**: 3x catch-up applies only when `cursorRef.current > 0` (`isMidAnimation`). At cursor=0 (fresh mount), 1.5x is used so the initial animation is visible. Never apply 3x unconditionally — it makes the first render appear as pop-in.
- **Debugging streaming pop-in**: Check Network tab → Response first. If individual `text-delta` events are visible, the transport is fine and the bug is in the React rendering layer (likely `useSmoothText` not applied, or React batching).

### MCP Servers

- **MCP configs stored in SESSIONS_KV** per user, injected into `~/.claude.json` at session start.
- **3 transport types**: `http` (direct URL), `stdio` (command in container), `relay` (browser-to-container WS tunnel).
- **Credential files**: Stored per-server, injected to container filesystem at configured paths. Paths auto-appended to CLAUDE.md so the agent knows they exist.
- **PUT /api/mcp/:name** for editing servers. **PUT /api/mcp/:name/toggle** for enable/disable.
- **Tool discovery**: `POST /api/mcp/:name/ping` sends JSON-RPC `tools/list` and caches results in KV.
- **MCP schema fields must appear in both** `McpServerConfigSchema` (src/types.ts Zod) AND `McpServerConfig` interface (ui/src/lib/types.ts). Missing from either = silently dropped on save.

### Testing

- Tests live in `src/**/__tests__/` (backend, Vitest) and `ui/src/**/__tests__/` (frontend, Vitest + jsdom). Run with `npm run test`.

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

### Settings / Integrations

- **`useIntegrationsStore`** (Zustand) is the single source of truth for plugins + MCP servers. Component tree: `IntegrationsTab` → `IntegrationsSidebar` → `PluginDetail` / `McpDetail`. Marketplace is a slide-in overlay (`MarketplaceSlideIn`), MCP add is a modal (`McpAddModal`).
- **Plugin injection order**: `injectPluginFiles()` runs first, then `injectUserConfigs()`. User configs (Command Center) take priority and can override plugin rules/commands.

### UX

- **Right-side controls rule**: All close/exit buttons and action controls go on the RIGHT side of headers. Title and info go on the LEFT. Pattern: `justify-between` with title-left, actions+close-right. Reference: IssueTracker.tsx header.

### Files / Upload

- `sandbox.writeFile()` crashes on large payloads (>~500KB) — use 8KB chunked exec
- Use `base64 -d` pipe for binary decode, never `node -e` (shell escaping breaks)
- R2 `list()` needs explicit `include: ['customMetadata']` with compat_date >= 2022-08-04

<!-- llmstxt:start -->
## Installed Documentation (llmstxt)

When working with these technologies, read the corresponding skill for detailed reference:

- Cloudflare: .agents/skills/cloudflare/SKILL.md
- Vercel's AI SDK: .agents/skills/vercel-ai-sdk/SKILL.md
- Docker Docs: .agents/skills/docker-docs/SKILL.md
- Model Context Protocol (MCP): .agents/skills/model-context-protocol-mcp/SKILL.md
<!-- llmstxt:end -->
