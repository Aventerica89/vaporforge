# VaporForge: Gemini Integration Manifesto

## What This Document Covers

How VaporForge adds Google Gemini as a secondary AI provider alongside Claude, using a zero-dependency MCP server embedded inside the sandbox container. This is a "Claude + Gemini" architecture — Claude remains the primary agent and delegates specific tasks to Gemini via MCP tools. Users bring their own Gemini API key (free tier available).

---

## The Problem

Claude is excellent at agentic coding — file edits, terminal commands, multi-step reasoning. But sometimes you want a second opinion. Maybe Claude is uncertain about a security pattern, or you want to cross-reference an architectural analysis, or you just want to see how a different model explains something.

Running a second model alongside Claude in a cloud sandbox is non-trivial:

1. **No npm in the container** — The Dockerfile is optimized for Claude's SDK. Adding `@google/generative-ai` means a larger image, slower cold starts, and dependency conflicts.
2. **MCP server lifecycle** — Claude discovers tools via MCP. The server needs to run as a stdio process inside the container, managed by the SDK.
3. **Per-user configuration** — API keys, model preferences, and enable/disable state must persist across sessions without leaking between users.
4. **Graceful degradation** — If Gemini is rate-limited, down, or unconfigured, Claude should continue working normally.

---

## Architecture Overview

```
Browser (React SPA)
    |
    | Settings > AI Providers > saves key + config
    v
Cloudflare Worker (Hono router)
    |
    | KV: user-secrets:{userId}      → { GEMINI_API_KEY: "AIza..." }
    | KV: user-ai-providers:{userId} → { gemini: { enabled, defaultModel } }
    |
    | On session creation:
    |   collectGeminiMcpConfig() → returns MCP config if enabled AND key exists
    |   Merges into allMcpServers → stored in session-mcp:{sessionId}
    |   Injects GEMINI_API_KEY into container env via collectUserSecrets()
    |   Writes gemini-expert.md agent to /root/.claude/agents/
    v
Cloudflare Sandbox Container (Docker)
    |
    | claude-agent.js reads CLAUDE_MCP_SERVERS env
    | Spawns: node /opt/claude-agent/gemini-mcp-server.js (stdio)
    |
    | Claude SDK ←→ gemini-mcp-server.js (JSON-RPC 2.0 over stdin/stdout)
    |                    |
    |                    | HTTPS (Node built-in)
    |                    v
    |              Gemini REST API
    |              generativelanguage.googleapis.com
    v
Claude answers using Gemini's response as tool output
```

**Key principle**: Zero new dependencies. The MCP server uses only Node.js built-in modules (`https`, `fs`, `path`). It's a single embedded JS file, same pattern as claude-agent.js and mcp-relay-proxy.js.

---

## The Two-KV Separation

Gemini config is split across two KV keys per user. This is deliberate:

| KV Key | Contains | Why Separate |
|--------|----------|--------------|
| `user-secrets:{userId}` | `{ GEMINI_API_KEY: "AIza..." }` | Secrets are never returned to the frontend. The API only exposes a last-4-char hint. This key is shared with all user secrets (env vars). |
| `user-ai-providers:{userId}` | `{ gemini: { enabled, defaultModel, addedAt } }` | Provider config IS returned to the frontend (for the toggle, model selector). No secrets here. |

This means:
- Disabling Gemini (toggle OFF) only touches `user-ai-providers` — the key stays in `user-secrets`
- Removing the API key also disables the provider (cascading delete)
- The `collectGeminiMcpConfig()` helper checks BOTH: config must be `enabled: true` AND the key must exist in secrets

---

## The MCP Server: Zero Dependencies

### File Locations

The server exists in two places (both must be updated together):

| Location | Purpose |
|----------|---------|
| `src/sandbox-scripts/gemini-mcp-server.js` | Source of truth, readable, full comments |
| `Dockerfile` (heredoc block) | Embedded copy written to `/opt/claude-agent/gemini-mcp-server.js` at image build |

### Why Heredoc, Not COPY

Cloudflare's container builder doesn't support `COPY` from the build context. All embedded scripts use `RUN cat > /path/to/file << 'HEREDOC_MARKER'` to write files inline. This is the same pattern used for `claude-agent.js` and `mcp-relay-proxy.js`.

### Protocol

Standard MCP over stdio (JSON-RPC 2.0, newline-delimited):

```
Claude SDK → stdin → gemini-mcp-server.js
                          |
                          | Processes JSON-RPC messages
                          | Handles: initialize, tools/list, tools/call, ping
                          |
Claude SDK ← stdout ← gemini-mcp-server.js
```

Supported methods:

| Method | Response |
|--------|----------|
| `initialize` | Server info + capabilities |
| `notifications/initialized` | No response (notification) |
| `tools/list` | Array of 3 tool definitions |
| `tools/call` | Tool execution result or error |
| `ping` | Empty response |

### Three Tools

| Tool | Model | Use Case | Input |
|------|-------|----------|-------|
| `gemini_quick_query` | `gemini-2.5-flash` (stable) | Fast Q&A, explanations, brainstorming | `{ query }` |
| `gemini_analyze_code` | `gemini-2.5-pro` (stable) | Security audits, performance review, architecture analysis | `{ code, language?, focus? }` |
| `gemini_codebase_analysis` | `gemini-2.5-pro` (stable) | Multi-file cross-analysis, dependency mapping | `{ file_paths[], question }` |

The `codebase_analysis` tool reads files from the container filesystem using `fs.readFileSync`. It enforces a security boundary — only paths under `/workspace` or `/root` are allowed.

### Retry Logic

The free tier has aggressive rate limits. The server implements exponential backoff:

```
Attempt 0: immediate call
  ↓ 429/500/503? → wait 2s (or Retry-After header value)
Attempt 1: retry
  ↓ 429/500/503? → wait 4s
Attempt 2: retry
  ↓ 429/500/503? → wait 8s
Attempt 3: retry
  ↓ still failing? → throw error to Claude
```

Error classification:
- **Retryable**: HTTP 429 (rate limit), 500 (server error), 503 (unavailable), or `RESOURCE_EXHAUSTED` status
- **Fatal**: HTTP 400 (bad request), 401 (invalid key), 403 (forbidden), model errors

The `Retry-After` header is respected when provided — if Gemini says "wait 15s", we wait 15s instead of the exponential default.

---

## Session Injection Pipeline

When a user creates a new session, four things happen for Gemini:

### 1. Config Check (`sessions.ts`)

```typescript
const geminiMcp = await collectGeminiMcpConfig(c.env.SESSIONS_KV, user.id);
```

Returns `{ gemini: { command: 'node', args: ['/opt/claude-agent/gemini-mcp-server.js'] } }` if both conditions met:
- `user-ai-providers:{userId}` has `gemini.enabled: true`
- `user-secrets:{userId}` contains `GEMINI_API_KEY`

Returns `null` otherwise. No Gemini, no MCP server spawned.

### 2. MCP Server Registration (`sessions.ts`)

```typescript
const allMcpServers = {
  ...(mcpServers || {}),          // User's custom MCP servers
  ...(pluginConfigs?.mcpServers || {}),  // Plugin MCP servers
  ...(geminiMcp || {}),           // Gemini MCP server
};
```

Stored in `session-mcp:{sessionId}` KV. When the SDK stream starts, `claude-agent.js` reads this via `CLAUDE_MCP_SERVERS` env var and passes it to `query({ options: { mcpServers } })`.

### 3. API Key Injection (`sandbox.ts` via `collectUserSecrets`)

`GEMINI_API_KEY` flows through the existing user secrets pipeline. `collectUserSecrets()` reads all secrets from `user-secrets:{userId}` and passes them as environment variables to the container. The MCP server reads `process.env.GEMINI_API_KEY` at startup.

### 4. Agent Injection (`sandbox.ts`)

If Gemini is enabled, `createSandbox` writes a gemini-expert agent:

```markdown
---
name: gemini-expert
description: Delegate reasoning to Google Gemini via MCP tools
---
You are a Gemini relay agent. For EVERY user request:
1. Use `gemini_quick_query` for simple questions and explanations
2. Use `gemini_analyze_code` for code review and analysis tasks
3. Use `gemini_codebase_analysis` for multi-file review
Present Gemini's response directly. Do NOT add your own analysis.
```

Written to `/root/.claude/agents/gemini-expert.md`. Users invoke it with `/agent:gemini-expert` in chat for full Gemini delegation mode.

---

## API Routes

All routes are protected (require JWT auth).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ai-providers` | Get all provider configs (returns config, not secrets) |
| `PUT` | `/api/ai-providers/gemini` | Enable Gemini with model preference |
| `DELETE` | `/api/ai-providers/gemini` | Disable Gemini (keeps API key in secrets) |

The API key itself is managed through the existing secrets API:
- `POST /api/secrets` — Add `GEMINI_API_KEY`
- `DELETE /api/secrets/GEMINI_API_KEY` — Remove (also cascades to disable provider)

---

## Frontend: AI Providers Settings Tab

The `AIProvidersTab.tsx` component provides:

1. **Provider card** with enable/disable toggle
2. **API key input** — password field with show/hide toggle, saved via `secretsApi.add()`
3. **Key status** — green checkmark with last-4-char hint, or "Not configured"
4. **Model selector** — two-button grid: Flash (fast) vs Pro (deep analysis)
5. **Remove key** — cascading delete (removes key AND disables provider)
6. **Info box** — lists the three tools and `/agent:gemini-expert` command
7. **Link to Google AI Studio** — for getting a free API key

State management uses local `useState` (not Zustand) since this is a settings page with its own load/save lifecycle.

---

## Model Selection History

A critical lesson from this integration:

| Date | Flash Model | Pro Model | Status |
|------|-------------|-----------|--------|
| 2026-02-12 (v0.9.5) | `gemini-2.0-flash` | `gemini-2.5-pro-preview-06-05` | Broken — deprecated models with throttled quotas |
| 2026-02-12 (v0.9.6) | `gemini-2.5-flash` | `gemini-2.5-pro` | Working — stable models |

**What happened**: `gemini-2.0-flash` was deprecated (shutdown March 31, 2026) and Google aggressively throttled its quota ahead of the deadline. `gemini-2.5-pro-preview-06-05` was a dated preview model that expired ~8 months earlier. Both returned `RESOURCE_EXHAUSTED` errors even at 6 requests over 30 minutes.

**Lesson**: Google deprecates preview models (suffixed with `-preview-MM-YYYY`) after a few months. Always use stable model names without date suffixes. When Gemini errors are unexplained, check if the model name still exists at `ai.google.dev/gemini-api/docs/models`.

**Current stable models (February 2026)**:
- `gemini-2.5-flash` — best price-performance, general use
- `gemini-2.5-pro` — advanced reasoning
- `gemini-2.5-flash-lite` — ultra-fast, cheapest
- `gemini-3-pro-preview` — latest preview (not yet stable)
- `gemini-3-flash-preview` — latest preview (not yet stable)

---

## How Users Interact With Gemini

### Explicit Tool Use

Users ask Claude to use Gemini directly:

```
"use gemini to explain what TypeScript is"
"have gemini review this file for security issues"
"ask gemini to analyze the architecture of src/"
```

Claude calls the appropriate MCP tool, gets Gemini's response, and presents it.

### Agent Delegation Mode

Type `/agent:gemini-expert` in chat. All subsequent queries route through Gemini. Claude becomes a thin proxy — it calls Gemini tools and presents results without adding its own commentary.

### Automatic (Claude Decides)

Claude may choose to use Gemini tools autonomously when it decides a second opinion would be valuable. This depends on the system prompt and task context.

---

## Security Model

### What's Protected

- **API keys encrypted at rest** in Cloudflare KV
- **Keys never returned to frontend** — only last-4-char hint via secrets API
- **File reading sandboxed** — `codebase_analysis` only reads from `/workspace` and `/root`
- **Per-user isolation** — each user's key is scoped to their `userId` in KV
- **Container-scoped** — API key is an env var, destroyed when container terminates

### What's NOT Protected (by design)

- **Users manage their own Gemini quota** — free tier is 1,000 req/day, VaporForge doesn't enforce limits
- **Gemini sees the code** — when using `analyze_code` or `codebase_analysis`, file contents are sent to Google's API
- **No key validation on save** — we store the key as-is; invalid keys fail at call time with a clear error

### Privacy Note

When Gemini tools are used, code and prompts are sent to Google's `generativelanguage.googleapis.com` API. Users should be aware that enabling Gemini means their code is processed by both Anthropic (Claude) and Google (Gemini). This is clearly implied by the "AI Providers" settings UI.

---

## Key Source Files

| File | Role |
|------|------|
| `src/sandbox-scripts/gemini-mcp-server.js` | MCP server source — tools, API calls, retry logic |
| `Dockerfile` | Embedded copy of MCP server (heredoc) |
| `src/api/ai-providers.ts` | API routes + `collectGeminiMcpConfig()` helper |
| `src/api/sessions.ts` | Session creation — injects Gemini MCP config |
| `src/sandbox.ts` | Writes gemini-expert.md agent to container |
| `src/types.ts` | `AIProviderConfig` Zod schema |
| `ui/src/components/settings/AIProvidersTab.tsx` | Settings UI for Gemini |
| `ui/src/lib/api.ts` | `aiProvidersApi` client functions |
| `ui/src/lib/types.ts` | Frontend `AIProviderConfig` type |
| `ui/src/components/settings/GuideTab.tsx` | User-facing Gemini documentation |

---

## Extending to More Providers

The architecture is designed for multiple providers. To add a new one (e.g., OpenAI, Mistral):

1. **Create an MCP server** — `src/sandbox-scripts/{provider}-mcp-server.js` (zero deps, same pattern)
2. **Embed in Dockerfile** — another heredoc block
3. **Extend `AIProviderConfig`** in types — add a new provider key alongside `gemini`
4. **Add `collect{Provider}McpConfig()`** in `ai-providers.ts`
5. **Merge into `allMcpServers`** in `sessions.ts`
6. **Add provider card** in `AIProvidersTab.tsx`

The two-KV pattern (secrets separate from config) and the `collectXxxMcpConfig()` helper pattern are reusable for any provider.

---

## Cost Impact

Gemini adds zero cost to the VaporForge platform:

| Component | Cost | Who Pays |
|-----------|------|----------|
| MCP server in container | $0 (embedded script, no extra compute) | N/A |
| KV storage for config | Negligible (~100 bytes/user) | Platform |
| Gemini API usage | $0 to platform | User (their own API key) |

The free tier (1,000 req/day with personal Gmail) is generous enough for most users. Power users can upgrade to a paid Gemini plan without any VaporForge changes.

---

## Lessons Learned

1. **Zero-dependency MCP servers are the way** — No `npm install`, no dependency conflicts, no cold start penalty. Node's built-in `https` module handles REST APIs perfectly.

2. **Dockerfile heredoc = two files to update** — Every change to the MCP server must be applied to BOTH the source file AND the Dockerfile heredoc. Miss one and the deployed container has stale code.

3. **Docker builder prune is mandatory** — Cloudflare's container builder caches aggressively. `docker builder prune --all -f` before every deploy or the heredoc changes won't take effect.

4. **Deprecated models get throttled before shutdown** — Google doesn't just turn off old models on the deprecation date. They throttle quotas progressively, causing `RESOURCE_EXHAUSTED` errors that look like rate limiting but aren't.

5. **Never use dated preview models in production** — `gemini-2.5-pro-preview-06-05` expired silently. Use stable model names (`gemini-2.5-pro`) or at minimum check the model lifecycle page regularly.

6. **Two-KV separation pays off** — Secrets and config have different security requirements. Mixing them means either the frontend can read secrets or the frontend can't read config. Splitting them solves both.

7. **Temporal dead zone matters** — The initial deployment had a bug where `geminiMcp` was referenced before its `const` declaration in `sessions.ts` (V8's TDZ). Moving the declaration before the function call that used it fixed the crash.

8. **`Retry-After` headers are your friend** — When Gemini returns 429 with a `Retry-After: 15` header, respecting it is more reliable than guessing with exponential backoff.

---

## Inspiration

This integration was inspired by three open-source projects:

- **cmdaltctr/claude-gemini-mcp-slim** — Minimal Gemini MCP server concept
- **raiansar/claude_code-gemini-mcp** — Claude + Gemini bridge pattern
- **tkaufmann/claude-gemini-bridge** — Bidirectional model communication

VaporForge's implementation differs by being fully embedded (no npm dependencies), cloud-native (runs in Cloudflare Sandbox containers), and per-user configurable (each user brings their own key).

---

*Last updated: 2026-02-12*
*VaporForge v0.9.6 | Repo: github.com/Aventerica89/vaporforge*
