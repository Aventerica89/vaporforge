# VaporForge - Claude Code Context

## Project Overview

Web-based Claude Code IDE on Cloudflare Sandboxes. Access Claude from any device using your existing Pro/Max subscription.

- **Live**: https://vaporforge.dev (app at /app/, landing at /)
- **Version**: 0.23.2
- **Repo**: Aventerica89/vaporforge

## MANDATORY RULES

1. **NEVER use Anthropic API keys for authentication.** Auth uses setup-token flow (OAuth tokens `sk-ant-oat01-*`), not API keys.
2. **OAuth tokens do NOT work for direct API calls.** QuickChat, Code Transform, and Analyze features require explicit API keys (`sk-ant-api01-*`) stored in user secrets. Only sandbox sessions use OAuth tokens (passed to Claude SDK inside the container).
3. **NEVER run `build:ui` alone.** Always use `npm run build` (runs build:info + build:landing + build:ui + build:merge). Running only build:ui leaves stale code in `dist/`.

## Architecture

```
Browser <-> Worker (Hono, auth, orchestration)
              |
              ├── WebSocket tunnel ──> Sandbox Container (ws-agent-server.js:8765)
              |                            └── spawns claude-agent.js -> Claude SDK -> Anthropic API
              |
              └── AI SDK (direct API) ──> Anthropic / Gemini APIs
                  (QuickChat, Transform, Analyze, CommitMsg)
```

**Main chat uses WebSocket streaming** (v0.20.0+). One WS connection per message, proxied through `sandbox.wsConnect(request, 8765)`. The container runs `ws-agent-server.js` which spawns `claude-agent.js` per query and pipes stdout as WS frames.

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
| `SANDBOX_CONTAINER` | Container | Claude SDK runtime (standard-2: 1 vCPU, 6 GiB) |
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
| `src/sandbox.ts` | Container lifecycle, file/agent/credential injection, WS proxy |
| `src/container.ts` | Sandbox DO class, WebSocket upgrade + proxy |
| `src/config-assembly.ts` | Assembles SandboxConfig from KV (MCP, secrets, plugins, creds) |
| `src/types.ts` | Shared TypeScript types + Zod schemas |
| `src/services/ai-provider-factory.ts` | Multi-provider model creation (Claude + Gemini) |
| `src/services/ai-schemas.ts` | Zod schemas for structured AI output |
| `src/api/sdk.ts` | Main chat — WS proxy to container agent + persist endpoint |
| `src/api/sessions.ts` | Session CRUD, sandbox create/resume |
| `src/api/mcp.ts` | MCP server CRUD, ping, tool discovery, credential collection |
| `src/api/secrets.ts` | Per-user secret management |
| `src/api/quickchat.ts` | SSE streaming chat (AI SDK streamText) |
| `src/api/transform.ts` | Code transform streaming |
| `src/api/analyze.ts` | Structured code analysis (streamText + Output.object) |
| `src/api/commit-msg.ts` | Smart commit message generation |
| `src/api/plugins.ts` | Plugin discovery from GitHub repos |
| `src/api/user.ts` | VF rules, CLAUDE.md, user config endpoints |
| `src/api/vaporfiles.ts` | R2 file management |
| `src/api/issues.ts` | Issue tracker backend |
| `src/api/git.ts` | Git operations in container |
| `src/api/github.ts` | GitHub repo operations |
| `src/api/favorites.ts` | User favorites |
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
| `hooks/useAuth.ts` | Auth state (Zustand) |
| `hooks/useQuickChat.ts` | Quick chat state + SSE streaming |
| `hooks/useSandbox.ts` | Sandbox session state |
| `hooks/useWebSocket.ts` | WebSocket streaming for main chat |
| `hooks/useSmoothText.ts` | Typewriter buffer for streaming text |
| `hooks/useLayoutStore.ts` | Panel layout state (Zustand) |
| `lib/api.ts` | API client with JWT auth |
| `lib/types.ts` | Frontend TypeScript types |

## Critical Gotchas

### SDK / Container

- **`IS_SANDBOX: '1'` env var REQUIRED** in container or CLI exits code 1
- **`options.env` REPLACES, not merges** — always spread `...process.env` first
- **`options.agents` REQUIRED for agent injection** — `settingSources` does NOT auto-discover agents from disk. Must parse .md files and pass as Record to `query()`.
- **Dockerfile `COPY` fails on CF** — use heredoc `RUN cat > file << 'EOF'` instead
- **Docker cache trap** — run `docker builder prune --all -f` before deploy if Dockerfile changed
- **Container image "skipping push" trap** — if `wrangler deploy` says "Image already exists remotely, skipping push" but you changed the Dockerfile, Docker cached layers produced the same hash. Fix: `docker image prune -a -f && docker builder prune -a -f` then redeploy.
- **AI SDK v6 stream events** — `text-delta` has `.text` property (not `.textDelta`). Same for `reasoning-delta`.
- **CF Sandbox `execStream()` is UNFIXABLE for streaming** — internal RPC buffering holds output until process exits. Use `sandbox.wsConnect(request, port)` for real-time WebSocket tunnel instead.

### Streaming (v0.20.0+)

- **Main chat uses WebSocket**, not SSE. One WS per message via `sandbox.wsConnect(request, 8765)`.
- **`ws-agent-server.js`** runs in container on port 8765, spawns `claude-agent.js` per query, pipes stdout as WS frames.
- **Context file pattern**: Worker writes secrets/config to `/tmp/vf-pending-query.json`, container reads + deletes.
- **`POST /api/sdk/persist`**: Browser saves full assistant text after stream completes (WS doesn't persist).
- **WS auth via query param** `?token=JWT` (WS upgrade requests can't carry custom headers from browser).
- **`emit()` helper in claude-agent.js**: `fs.writeSync(1, ...)` bypasses Node's block-buffered stdout.

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

- Root CSS: `html, body { position: fixed; width: 100%; height: 100% }`
- Always use `visualViewport.height` (not `dvh` or `100%`) for mobile sizing
- No `scrollIntoView()` — causes iOS keyboard push-up
- `window.scrollTo(0,0)` on every viewport resize as safety net

### UX

- **Right-side controls rule**: All close/exit buttons and action controls go on the RIGHT side of headers. Title and info go on the LEFT. Pattern: `justify-between` with title-left, actions+close-right. Reference: IssueTracker.tsx header. This reduces mouse travel since nav icons are already on the right.

### Files / Upload

- `sandbox.writeFile()` crashes on large payloads (>~500KB) — use 8KB chunked exec
- Use `base64 -d` pipe for binary decode, never `node -e` (shell escaping breaks)
- R2 `list()` needs explicit `include: ['customMetadata']` with compat_date >= 2022-08-04

---

## Core Philosophy

**Key Principles:**
1. **Plan Before Execute**: Think through the approach before coding
2. **Test-Driven**: Write tests before implementation when possible
3. **Security-First**: Never compromise on security
4. **Immutability**: Never mutate objects or arrays
5. **Small Files**: Many small files over few large files

---

## CLI-First Rule (CRITICAL)

ALWAYS check available tools BEFORE asking the user for information. Your credentials are all stored in 1Password. Check there first.

| Need | Check First |
|------|-------------|
| File contents | Just read the file |
| Git info | Run `git` commands |
| Dependencies | Read package.json |
| Env vars needed | Grep for `process.env.*` in codebase |
| Project structure | List directory, read config files |
| Platform/framework | Check config files (tsconfig, vite.config, etc.) |
| What changed | Run `git diff`, `git log` |

**Decision tree:**
1. Can I read a file for this? -> Read it
2. Can I run a command for this? -> Run it
3. Can I infer from context? -> Use inference
4. ONLY THEN -> Ask the user

**Rule**: If you can get information yourself, DO IT. Only ask for things that truly require user input.

---

## Code Style

- No emojis in code, comments, or documentation
- Prefer immutability - always create new objects, NEVER mutate
- 200-400 lines typical, 800 max per file
- Functions under 50 lines
- No deep nesting (max 4 levels)
- Proper error handling everywhere
- No console.log left in production code
- No hardcoded values

### Immutability (CRITICAL)

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return { ...user, name }
}
```

### Input Validation

Always validate user input with Zod when possible:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})
```

---

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`
- Always test locally before committing
- Small, focused commits

---

## Testing

- TDD preferred: Write tests first (RED), implement (GREEN), refactor (IMPROVE)
- 80% minimum coverage target
- Unit + integration + E2E for critical flows

---

## Security

Before ANY commit:
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- Error messages don't leak sensitive data

```javascript
// NEVER: Hardcoded secrets
const apiKey = "sk-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY
```

---

## API Response Pattern

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: { total: number; page: number; limit: number }
}
```

---

## String Length Limits

- Inline strings in code: 500 chars max
- Template literals: 1000 chars max
- Error messages: 200 chars max
- Extract long content to constants or separate files
- Break up large templates into composable parts

---

## My Repositories (GitHub: Aventerica89 / JBMD-Creations)

Key repos for reference:
- `vaporforge` - This platform (CF Workers + Sandboxes + React)
- `renvio-companion-app` - Renal patient companion (Next.js + Drizzle + Turso)
- `jb-cloud-app-tracker` - App dashboard (Next.js + Supabase)
- `claude-codex` - Claude Code config and rules (Astro + Turso)
- `HDFlowsheet` / `HDFlowsheet-Cloud` - Hemodialysis flowsheet apps

---

## Success Metrics

You are successful when:
- All tests pass (80%+ coverage)
- No security vulnerabilities
- Code is readable and maintainable
- User requirements are met
