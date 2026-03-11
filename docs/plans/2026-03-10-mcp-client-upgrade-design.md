# MCP Client Upgrade Design

**Date:** 2026-03-10
**Status:** Draft (implementation deferred)
**Reference:** `/Users/jb/Desktop/MCP_Integration_Guide.md`

## Context

VaporForge's MCP implementation was audited against the official MCP Client Integration Guide. The current system covers STDIO, HTTP, and relay transports, env var injection (Pattern A), transport headers (Pattern B), and tool discovery. Three gaps were identified.

## Current State (What Works)

- 3 transport types: HTTP, STDIO, relay (browser bridge)
- Tool discovery via JSON-RPC `tools/list` with KV caching
- Credential injection: env vars, headers, and credential files
- Hot-reload between messages (`refreshMcpConfig`)
- Plugin-bundled MCP servers
- Per-session credential isolation

## Gap 1: Auth-URL Delegation (Pattern C)

**Problem:** Some MCP servers handle OAuth internally via a `get_auth_url` tool. The server generates an OAuth URL, the user authenticates in-browser, and the server stores the token. VaporForge has no UI flow for this.

**Approach:** Detect `get_auth_url` tool calls in the container stream. When detected, surface a clickable auth link in the chat UI. After the user completes OAuth (callback goes to the MCP server directly), the server handles token storage internally.

**Changes needed:**
- New message part type `mcp-auth` in MessageContent rendering
- Container-side detection in `claude-agent.js` stream parser
- Optional: polling mechanism to detect when auth completes

## Gap 2: Worker-Side MCP Client

**Problem:** All MCP interaction runs inside the container via Claude SDK. The Worker has no direct MCP client, limiting ability to intercept tool calls, enforce rate limits, or audit usage.

**Approach:** Install `@modelcontextprotocol/sdk` in the Worker. Create a `WorkerMCPClient` that wraps HTTP-transport servers for:
- Rate limiting (per-user, per-server)
- Tool call audit logging
- Cost tracking (tool calls per session)
- Server health monitoring (beyond simple GET ping)

**Changes needed:**
- New `src/services/mcp-client.ts` — Worker-side MCP client wrapper
- Rate limit config wired to existing `rateLimit` schema field
- Audit log to KV or D1

## Gap 3: Streamable HTTP Transport

**Problem:** The MCP spec now supports `StreamableHTTPClientTransport` (replacing SSE). VF uses raw HTTP POST for ping only and delegates actual MCP to the SDK inside the container.

**Approach:** When Worker-side MCP client is built (Gap 2), use `StreamableHTTPClientTransport` for the connection. This gives better reliability, bidirectional streaming, and automatic reconnection.

**Changes needed:**
- Depends on Gap 2 (Worker-side client)
- Replace `discoverTools()` raw fetch with SDK transport
- Support `Content-Type: text/event-stream` responses

## Implementation Priority

1. **Gap 2** (Worker-side client) — foundational, enables Gaps 1 and 3
2. **Gap 1** (Auth-URL) — user-facing, enables more MCP servers
3. **Gap 3** (Streamable HTTP) — protocol upgrade, reliability improvement

## Bug Fixed (This Session)

**Status dot mismatch:** Frontend checked `status === 'ok'` but backend returned `'online'`. Fixed in `useIntegrationsStore.ts` — both `pingAllMcps` and `pingSingleMcp` now check for `'online'`.
