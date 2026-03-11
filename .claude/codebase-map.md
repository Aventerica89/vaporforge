# VaporForge Codebase Map

Quick-reference for navigating the codebase without re-searching every session.

---

## QuickChat (AI sidebar, Cmd+Shift+Q)

| What | Where |
|------|-------|
| Backend route handler (stream, list, history, delete) | `src/api/quickchat.ts` |
| Tool definitions (runCommand, readFile, create_plan, etc.) | `src/api/quickchat.ts` → `createSandboxTools()` |
| Slash command list (`/explain`, `/bugs`, `/t-file`, etc.) | `ui/src/components/QuickChatPanel.tsx` → `QC_COMMANDS` (line ~61) |
| UI component (messages, approval cards, streaming) | `ui/src/components/QuickChatPanel.tsx` |
| State & SSE transport hook | `ui/src/hooks/useQuickChat.ts` |
| Route registration | `src/router.ts` → `/api/quickchat/*` |

### QuickChat approval flow (human-in-the-loop)

The `runCommand` tool has `needsApproval: true`. Flow:
1. First POST → streamText → Gemini calls tool → `approval-requested` state sent to browser
2. User approves → browser re-POSTs with `approval-responded` state
3. **Fix 2** (`src/api/quickchat.ts`): detects `tool-approval-response` parts without `tool-result`, executes tool, injects result before streamText
4. If user ignores approval and sends new message → **Fix 3**: converts `approval-requested` (type `"tool-{name}"`) to `output-denied`, `convertToModelMessages` produces proper error `tool-result`

Key gotcha: AI SDK v6 names tool parts `"tool-{toolName}"` (e.g. `"tool-runCommand"`), NOT `"tool"`. Check with `part.type.startsWith('tool-')` or `isStaticToolUIPart()`.

---

## Main Chat (Claude sessions via sandbox)

| What | Where |
|------|-------|
| WebSocket proxy to container | `src/api/sdk.ts` |
| HTTP streaming bridge (V1.5, Durable Object) | `src/agents/chat-session-agent.ts` |
| Container agent script | `src/sandbox-scripts/claude-agent.js` |
| WS server in container | `src/sandbox-scripts/ws-agent-server.js` |
| Session CRUD + sandbox create/resume | `src/api/sessions.ts` |
| Chat history endpoints | `src/api/chat.ts` |
| Main chat UI | `ui/src/components/ChatPanel.tsx` |
| Message rendering (tool cards, reasoning, etc.) | `ui/src/components/chat/message.tsx` |
| WebSocket streaming hook | `ui/src/hooks/useWebSocket.ts` |

---

## Settings / Integrations

| What | Where |
|------|-------|
| Full settings page (tabs) | `ui/src/components/SettingsPage.tsx` |
| Integrations tab (plugins + MCP) | `ui/src/components/settings/IntegrationsTab.tsx` |
| Plugin detail panel | `ui/src/components/settings/integrations/PluginDetail.tsx` |
| MCP detail panel | `ui/src/components/settings/integrations/McpDetail.tsx` |
| Shared primitives (Toggle, SectionHeader, etc.) | `ui/src/components/settings/integrations/shared.tsx` |
| Commands tab (user slash commands) | `ui/src/components/settings/CommandsTab.tsx` |
| Command registry hook (loads user + plugin commands) | `ui/src/hooks/useCommandRegistry.ts` |
| Slash command menu hook | `ui/src/hooks/useSlashCommands.ts` |
| Integrations store (Zustand) | `ui/src/hooks/useIntegrationsStore.ts` |

---

## Slash Commands (user-defined, via Settings)

Stored via `configApi.add('commands', { filename, content })` → `POST /api/config/commands`
- Content becomes the prompt text when selected
- Distinct from `QC_COMMANDS` (hardcoded in `QuickChatPanel.tsx` for quick access)

---

## Auth

| What | Where |
|------|-------|
| Setup-token validation, JWT, token refresh | `src/auth.ts` |
| Auth state (Zustand) | `ui/src/hooks/useAuth.ts` |
| Execution JWT (container callback auth) | `src/utils/jwt.ts` |

OAuth tokens (`sk-ant-oat01-`) → container subprocess only. API keys (`sk-ant-api01-`) → direct AI SDK calls (QuickChat, Transform, Analyze).

---

## Cloudflare Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `SESSIONS` | Durable Object | Session persistence (SQLite) |
| `CHAT_SESSIONS` | Durable Object | V1.5 HTTP streaming bridge |
| `Sandbox` | Container (2 vCPU, 8 GiB) | Claude SDK runtime |
| `AUTH_KV` | KV | User records, plugin config, AI provider settings |
| `SESSIONS_KV` | KV | Chat history, secrets, VF rules, MCP configs, QuickChat messages |
| `FILES_BUCKET` | R2 | VaporFiles persistent storage |

### Container lifecycle gotchas

- `startProcess` env **replaces** container env — always include `PATH`, `HOME`, `NODE_PATH`
- `VF_CONTAINER_BUILD` env var in Dockerfile — bump when editing any `sandbox-scripts/*.js`
- `src/sandbox-scripts/` is source of truth; Dockerfile `COPY` picks up changes automatically
- OAuth token field in KV: `claudeToken` inside `user:{userId}` JSON (not a separate key)

---

## Build Pipeline

```
build:info  →  build:landing (Astro)  →  build:ui (Vite)  →  build:merge
```
- `dist/` is what wrangler deploys — never `ui/dist/` directly
- `npm run build` always (never `build:ui` alone)
- Deploy: `~/.bun/bin/wrangler deploy` (not `npx wrangler` — arm64 binary issue)

---

## MCP

| What | Where |
|------|-------|
| CRUD, ping, tool discovery | `src/api/mcp.ts` |
| Route definitions | `src/api/mcp-routes.ts` (if split) |
| WS relay for local MCP | `src/api/mcp-relay.ts` + `src/sandbox-scripts/mcp-relay-proxy.js` |
| Schema (must match both sides) | `src/types.ts` → `McpServerConfigSchema` AND `ui/src/lib/types.ts` → `McpServerConfig` |

---

## Pencil Design Files

Active frames in `VaporForge Integrations.pen`:
- `OzB38` — plugin sidebar
- `XwAhA` — (secondary frame)
- `BmENi` — expandable plugin sidebar (shipped)
- `uFqVs` — MCP detail panel (shipped)

Old IDs `Sr3UQ`/`ZHKQy` no longer exist.

---

## Open Issues (as of 2026-03-11)

- **#7** — Obsidian sub-items not rendering correctly
- **#10** — Agent full system prompt leaking into chat UI
- `billing.ts` has a pre-existing TS2322 type error (Stripe API version string mismatch) — not blocking deploys
