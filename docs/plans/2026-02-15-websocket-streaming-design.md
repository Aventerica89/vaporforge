# WebSocket Streaming Design

## Problem

Main chat streaming is broken: text arrives all at once after ~30-60s instead of progressively. Root cause: Cloudflare Sandbox `execStream()` returns SSE-over-RPC that buffers internally until the process exits. We cannot control this buffering.

## Solution

Replace the `execStream()` SSE pipeline with **WebSocket streaming** via `sandbox.wsConnect()`. WebSocket frames are delivered immediately (no intermediary buffering), giving true real-time text streaming.

## Architecture

### Current (broken)

```
Container stdout → execStream() SSE/RPC → Worker TransformStream → Browser fetch reader
                   ^^^^^^^^^^^^^^^^^^^^
                   (buffered by CF internally)
```

### New (WebSocket)

```
Container stdout → WS server (port 8765) → wsConnect() WS proxy → Browser WebSocket
```

## Components

### 1. Container: ws-agent-server.js

A lightweight WebSocket server running as a background process inside the container. Uses the `ws` npm package (installed globally in Dockerfile).

**Lifecycle**: Started once when sandbox is created/woken. Lives for the container's lifetime. Handles sequential queries (one at a time).

**Protocol**:
- Client connects → server sends `{ type: "ready" }`
- Client sends: `{ action: "query", contextFile: "/tmp/vf-query-xxx.json" }`
- Server reads context file (contains prompt, sessionId, cwd, env, mode)
- Server deletes context file (one-time use, contains secrets)
- Server spawns `node claude-agent.js <prompt> <sessionId> <cwd>` with env
- Server pipes stdout lines as WS frames (same JSON protocol as current)
- After process exits, server sends `{ type: "process-exit", exitCode }` and waits for next query

**Why context file**: Env vars (OAuth token, MCP config, user secrets) must stay server-side. The Worker writes them to a temp file via `sandbox.writeFile()`, the WS server reads and deletes it. Browser never sees secrets.

**Port**: 8765 (arbitrary, not exposed publicly — only accessible via `wsConnect`)

### 2. Worker: SDK WS upgrade handler

New WebSocket upgrade path in `index.ts`:

```
/api/sdk/ws?sessionId=X&token=Y
```

**Flow**:
1. Parse sessionId and JWT from query params
2. Validate JWT (reuse auth logic from middleware)
3. Get sandbox instance via SandboxManager
4. Assemble env vars and config (same logic as current POST /stream)
5. Write context to `/tmp/vf-query-{uuid}.json` via `sandbox.writeFile()`
6. Return `sandbox.wsConnect(request, 8765)` to proxy the WS connection

**One WS connection per message**: Browser opens a new WS for each prompt. This keeps the flow simple and ensures fresh auth/config per message.

**Routing**: In `index.ts`, check `url.pathname === '/api/sdk/ws'` before the existing DO WS routing. This keeps SDK WS separate from MCP relay WS.

### 3. Browser: WebSocket client

Replace `sdkApi.stream()` (fetch-based SSE reader) with a WebSocket-based async generator that yields the same event types.

**New function**: `sdkApi.streamWs()` — opens WS, sends query trigger, yields parsed JSON events.

**Zustand store**: `useSandbox.ts` `sendMessage()` switches from `sdkApi.stream()` to `sdkApi.streamWs()`. All downstream state updates (text accumulation, tool rendering, parts array) stay identical.

**Reconnection**: Not needed for streaming (one WS per message). If the WS fails, the error handler catches it and shows an error message, same as current behavior.

## Files to Create

| File | Purpose |
|------|---------|
| `src/sandbox-scripts/ws-agent-server.js` | Container WS server (background process) |

## Files to Modify

| File | Change |
|------|--------|
| `Dockerfile` | Add `npm install -g ws`, embed ws-agent-server.js, start it in entrypoint |
| `src/index.ts` | Route `/api/sdk/ws` WS upgrades to new handler |
| `src/sandbox.ts` | Add `wsConnectToSandbox()` method, add `startWsServer()` method |
| `src/api/sdk.ts` | Add WS upgrade handler function (auth + context file + wsConnect) |
| `ui/src/lib/api.ts` | Add `sdkApi.streamWs()` WebSocket-based async generator |
| `ui/src/hooks/useSandbox.ts` | Switch `sendMessage()` from `sdkApi.stream()` to `sdkApi.streamWs()` |

## Implementation Sequence

1. **Dockerfile + ws-agent-server.js** — Build container with WS server
2. **sandbox.ts** — Add wsConnect proxy method + WS server startup
3. **sdk.ts + index.ts** — WS upgrade handler with auth + context file
4. **api.ts** — Browser WS client (async generator)
5. **useSandbox.ts** — Wire up new streaming path
6. **Test end-to-end** — Deploy, verify progressive streaming works

## KV Persistence

The current SSE handler persists user/assistant messages to KV in `waitUntil`. With WS, this moves to:

- **User message**: Written to KV before the WS connection is established (same as now)
- **Assistant message**: The WS upgrade handler can't use `waitUntil` directly. Options:
  a. The WS server sends `{ type: "done", fullText }` as the last frame. Browser POSTs the full text back to a new endpoint (e.g., `POST /api/sdk/persist`)
  b. The Worker intercepts the `done` frame in a WS message handler and writes to KV

Option (a) is simpler and keeps the WS path clean.

## Fallback

Keep the existing SSE endpoint (`POST /api/sdk/stream`) as a fallback. The browser can detect WS failure and fall back to SSE. This also allows gradual rollout.

## Security

- JWT validated server-side before WS upgrade (no unauthenticated connections)
- Secrets written to temp file via `sandbox.writeFile()`, never sent over WS from browser
- Context file deleted immediately after reading
- WS server only accessible via `wsConnect` (not exposed to internet)
- Same auth model as current SSE approach

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `wsConnect` might also buffer | Unlikely — it's designed for real-time (terminal) use. Can test quickly. |
| WS server crashes | Health check on connect; restart via `startProcess` if needed |
| Container recycle loses WS server | Re-start in `ensureConfigInjected` (already handles container wakes) |
| Large tool outputs over WS | Same 500-char truncation as current (in claude-agent.js) |
