# MCP Server Management Update — Design

> **Goal:** Align VaporForge's MCP add/configure flow with Warp-style patterns. Phase 1 of 2.
>
> **Reference:** https://docs.warp.dev/agent-platform/capabilities/mcp
>
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Architecture:** Cherry-pick 4 features from Warp's MCP management: paste-to-add JSON, custom headers for HTTP servers, env vars for stdio servers, and expandable tool discovery. Backend changes are minimal (schema + ping enhancement). Frontend changes are focused on McpTab.tsx.

**Tech Stack:** React 18, Tailwind v3.4, Hono (Worker), Cloudflare KV, Zod

---

## Features

### 1. Paste JSON Config to Add

Many MCP servers only provide a JSON config block in their docs. Users need to paste that JSON and have VaporForge parse it into server entries.

**Parser supports 3 formats:**

1. **Wrapped (Claude Code / Warp):** `{ "mcpServers": { "name": { ... } } }` — each key becomes a server name
2. **Single server with name:** `{ "name": "foo", "url": "..." }` — direct add
3. **Single server without name:** `{ "url": "..." }` or `{ "command": "..." }` — prompt for name

**Transport auto-detection:** has `url` = http, has `command` = stdio.

**UI flow:**
- "Paste Config" button next to "Add Server" in header
- Opens modal with textarea + "Parse" button
- Preview table shows parsed servers (name, transport, URL/command)
- User can remove individual entries or edit names
- "Add All" button commits

### 2. Custom Headers

HTTP MCP servers may require authentication headers (e.g. `Authorization: Bearer token`).

- New optional `headers` field on `McpServerConfig` (Record<string, string>)
- Key-value pair editor in add form when transport = http
- Values masked by default (password input), toggle to reveal
- Passed through to SDK MCP config: `{ type: 'http', url, headers }`

### 3. Env Vars per Server

stdio/CLI MCP servers may need environment variables (e.g. `GITHUB_TOKEN=ghp_xxx`).

- New optional `env` field on `McpServerConfig` (Record<string, string>)
- Key-value pair editor in add form when transport = stdio
- Values masked by default, toggle to reveal
- Passed through to SDK config alongside command/args

### 4. Expandable Tool List

Like Warp's UI (screenshot reference), show available tools per server.

- Collapsed view: `"context7 · 2 tools available >"` with tool count
- Expanded view: tool names as pill/chip badges
- Data source: cached from MCP `tools/list` call during ping
- New fields: `tools?: string[]`, `toolCount?: number` on McpServerConfig
- Ping endpoint enhanced to query tools and cache results to KV

---

## Schema Changes

**`src/types.ts` — McpServerConfigSchema:**

```typescript
// New optional fields
headers?: Record<string, string>   // HTTP auth headers
env?: Record<string, string>       // stdio env vars
tools?: string[]                   // cached tool names from ping
toolCount?: number                 // total tool count
```

## Backend Changes

| File | Change |
|------|--------|
| `src/types.ts` | Add headers, env, tools, toolCount to Zod schema |
| `src/api/mcp.ts` | Pass headers/env through in collectMcpConfig(); enhance ping to query tools/list |
| `src/sandbox.ts` | Include headers in HTTP config, env in stdio config during injection |

## Frontend Changes

| File | Change |
|------|--------|
| `ui/src/components/settings/McpTab.tsx` | Paste modal, headers editor, env editor, tool pills, tool count in collapsed view |
| `ui/src/lib/mcp-config-parser.ts` | New: JSON parser with format auto-detection |
| `ui/src/lib/types.ts` | Mirror new schema fields |

## Security

- Headers/env values stored in `user-mcp:{userId}` KV (same security as existing configs)
- Values masked in UI by default
- Paste modal shows warning about pasted secrets
- No secrets logged or exposed in health check responses

---

## Phase 2 (Deferred — see BACKLOG.md)

- OAuth auto-trigger on add (MCP OAuth client, browser popup, token exchange)
- Start/Stop + View Logs
- Server sharing with redacted secrets
