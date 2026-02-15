# WebSocket Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken `execStream()` SSE pipeline with `sandbox.wsConnect()` WebSocket streaming so chat text appears progressively instead of all at once.

**Architecture:** Container runs a lightweight WS server on port 8765. Worker proxies browser WS connections to it via `sandbox.wsConnect()`. Browser opens one WS per message, receives real-time JSON frames identical to the current protocol.

**Tech Stack:** Node.js `ws` package in container, Cloudflare Sandbox `wsConnect()` API, browser native WebSocket.

**Design doc:** `docs/plans/2026-02-15-websocket-streaming-design.md`

---

## Task 1: Install `ws` package in Dockerfile

**Files:**
- Modify: `Dockerfile:9`

**Step 1: Add ws to global npm install**

In `Dockerfile`, find the line with `npm install -g @anthropic-ai/claude-agent-sdk@latest`. Append ` ws` to the install list so the `ws` package is available globally in the container.

**Step 2: Verify change**

Read `Dockerfile` line 9 to confirm `ws` is in the `npm install -g` list.

**Step 3: Commit**

```bash
cd ~/vaporforge && git add Dockerfile
git commit -m "chore: install ws package globally in container"
```

---

## Task 2: Create ws-agent-server.js (container WS server)

**Files:**
- Create: `src/sandbox-scripts/ws-agent-server.js`

**Step 1: Write the WS server**

Create `src/sandbox-scripts/ws-agent-server.js`. This is a lightweight WebSocket server that:

1. Listens on port 8765 inside the container
2. On each new connection, reads `/tmp/vf-pending-query.json` (written by the Worker before proxying the WS)
3. Deletes the context file immediately (one-time use, contains secrets)
4. Uses `child_process.spawn('node', [agentScript, prompt, sessionId, cwd])` with the merged env
5. Pipes each stdout line (JSON protocol) as a WS frame
6. Sends `{ type: "process-exit", exitCode }` when the child finishes
7. Handles sequential queries (one at a time)

Use `const { WebSocketServer } = require('ws')` and `const { spawn } = require('child_process')`.

The server auto-starts the query on connection (reads context file after 100ms delay to ensure write completes). No client-initiated trigger message needed.

See design doc for full protocol spec.

**Step 2: Verify the file exists and has the WebSocketServer on port 8765**

**Step 3: Commit**

```bash
cd ~/vaporforge && git add src/sandbox-scripts/ws-agent-server.js
git commit -m "feat: add WebSocket agent server for container streaming"
```

---

## Task 3: Embed ws-agent-server.js in Dockerfile

**Files:**
- Modify: `Dockerfile`

**Step 1: Add heredoc embedding**

After the Gemini MCP server block (after `RUN chmod +x /opt/claude-agent/gemini-mcp-server.js`), add a new heredoc block that embeds the full contents of `src/sandbox-scripts/ws-agent-server.js` at `/opt/claude-agent/ws-agent-server.js`. Use the same pattern as the other embedded scripts:

```dockerfile
# Embed WebSocket agent server for real-time streaming
# IMPORTANT: Keep in sync with src/sandbox-scripts/ws-agent-server.js
RUN cat > /opt/claude-agent/ws-agent-server.js << 'WS_SERVER_EOF'
<full contents of ws-agent-server.js>
WS_SERVER_EOF

RUN chmod +x /opt/claude-agent/ws-agent-server.js
```

**Step 2: Verify the Dockerfile has the ws-agent-server.js heredoc**

**Step 3: Commit**

```bash
cd ~/vaporforge && git add Dockerfile
git commit -m "chore: embed ws-agent-server.js in Dockerfile"
```

---

## Task 4: Add WS server startup + wsConnect proxy to sandbox.ts

**Files:**
- Modify: `src/sandbox.ts`

**Step 1: Add `startWsServer` method to SandboxManager**

After `execStreamInSandbox` (around line 434), add a method that:
- Checks if ws-agent-server.js is already running via `pgrep -f ws-agent-server.js`
- If not running, starts it with `nohup node /opt/claude-agent/ws-agent-server.js > /tmp/ws-agent-server.log 2>&1 &`
- Waits 500ms for binding
- Verifies it started with another pgrep check
- Logs pid on success

**Step 2: Add `wsConnectToSandbox` method**

Calls `sandbox.wsConnect(request, 8765)` and returns the Response. This proxies the WS upgrade to the container port.

**Step 3: Add `writeContextFile` method**

Writes query context (prompt, sessionId, cwd, env) as JSON to `/tmp/vf-pending-query.json` in the container via `sandbox.writeFile()`. Returns the path.

**Step 4: Run typecheck**

```bash
cd ~/vaporforge && npx tsc --noEmit
```

**Step 5: Commit**

```bash
cd ~/vaporforge && git add src/sandbox.ts
git commit -m "feat: add WS server startup, wsConnect proxy, and context file methods"
```

---

## Task 5: Add WS upgrade handler in sdk.ts

**Files:**
- Modify: `src/api/sdk.ts`

**Step 1: Add GET /ws handler**

After the existing POST `/stream` handler, add a new `sdkRoutes.get('/ws', ...)` that:

1. Validates OAuth token on the user (same check as SSE handler)
2. Reads `sessionId`, `prompt`, `cwd`, `mode` from URL search params
3. Assembles sandbox config, verifies session ownership, checks sandbox is active
4. Persists user message to KV (same as SSE handler)
5. Strips `[command:/name]` or `[agent:/name]` prefix from prompt (same logic as SSE)
6. Retrieves MCP config from KV
7. Calls `sandboxManager.startWsServer(session.sandboxId)`
8. Builds agent env object (same env assembly as SSE handler)
9. Calls `sandboxManager.writeContextFile(session.sandboxId, { prompt, sessionId, cwd, env })`
10. Returns `sandboxManager.wsConnectToSandbox(session.sandboxId, c.req.raw)`

**Step 2: Export the handler function**

Export a standalone `handleSdkWs` function that accepts a Hono context, for use by `router.ts` (WS needs to bypass the protected routes auth middleware since auth comes via query param, not header).

**Step 3: Add POST /persist endpoint**

Add `sdkRoutes.post('/persist', ...)` that:
1. Reads `sessionId`, `content`, `sdkSessionId` from body
2. Persists assistant message to KV
3. Updates session's `sdkSessionId` if changed
4. Calls `syncConfigFromContainer` (best-effort)
5. Returns `{ success: true }`

**Step 4: Run typecheck**

```bash
cd ~/vaporforge && npx tsc --noEmit
```

**Step 5: Commit**

```bash
cd ~/vaporforge && git add src/api/sdk.ts
git commit -m "feat: add WebSocket upgrade handler and persist endpoint"
```

---

## Task 6: Route /api/sdk/ws in index.ts and router.ts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/router.ts`

**Step 1: Update index.ts WS routing**

In `src/index.ts`, update the WebSocket upgrade block (lines 14-27) to check the pathname first. If `url.pathname === '/api/sdk/ws'`, route through Hono (so auth middleware and sdk handler run). All other WS paths continue to the Durable Object.

```typescript
if (request.headers.get('Upgrade') === 'websocket') {
  const url = new URL(request.url);

  // SDK WebSocket streaming — route through Hono (auth + sandbox proxy)
  if (url.pathname === '/api/sdk/ws') {
    const router = createRouter(env);
    return router.fetch(request, env, ctx);
  }

  // All other WS — route to Durable Object (MCP relay, etc.)
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }
  const id = env.SESSIONS.idFromName(sessionId);
  const stub = env.SESSIONS.get(id);
  return stub.fetch(request);
}
```

**Step 2: Register WS route in router.ts with inline auth**

The WS handler can't use the standard protected routes middleware because WS connections send JWT as a query param (not Authorization header). Add the route before the protected routes group:

1. Import `handleSdkWs` from `./api/sdk`
2. Add `app.get('/api/sdk/ws', ...)` that reads `token` from query params, calls `authService.verifySessionToken(token)`, sets the user, and delegates to `handleSdkWs`

Check that `AuthService` has a `verifySessionToken` method (or use whatever method `extractAuth` uses internally). If it uses JWT verification, call that directly.

**Step 3: Run typecheck**

```bash
cd ~/vaporforge && npx tsc --noEmit
```

**Step 4: Commit**

```bash
cd ~/vaporforge && git add src/index.ts src/router.ts
git commit -m "feat: route /api/sdk/ws through Hono with inline JWT auth"
```

---

## Task 7: Add WebSocket streaming client to api.ts

**Files:**
- Modify: `ui/src/lib/api.ts`

**Step 1: Add `streamWs` method to sdkApi**

After the existing `stream` method in the `sdkApi` object, add `streamWs`. This is an async generator that:

1. Builds a WS URL: `wss://{host}/api/sdk/ws?sessionId=X&prompt=Y&cwd=Z&mode=M&token=JWT`
2. Opens a native `WebSocket`
3. Uses a queue + Promise pattern to yield messages as they arrive
4. Maps claude-agent.js protocol to frontend event types:
   - `text-delta` -> `{ type: 'text', content: msg.text }`
   - `session-init` -> `{ type: 'session-init', sessionId }`
   - `tool-start` -> `{ type: 'tool-start', id, name, input }`
   - `tool-result` -> `{ type: 'tool-result', id, name, output }`
   - `done` -> `{ type: 'done', sessionId, fullText }`
   - `error` -> `{ type: 'error', content: msg.error }`
   - `process-exit` -> `{ type: 'ws-exit', exitCode }`
5. Handles abort signal by closing the WS
6. Closes WS in finally block

The yield type matches the existing `stream` method exactly (same interface).

**Step 2: Add `persistMessage` method to sdkApi**

Add a simple method that POSTs to `/api/sdk/persist` with `{ sessionId, content, sdkSessionId }`. Wrap in try/catch — persistence is best-effort.

**Step 3: Verify both methods exist in the sdkApi object**

**Step 4: Commit**

```bash
cd ~/vaporforge && git add ui/src/lib/api.ts
git commit -m "feat: add WebSocket streaming client and persist method"
```

---

## Task 8: Wire up WS streaming in useSandbox.ts

**Files:**
- Modify: `ui/src/hooks/useSandbox.ts`

**Step 1: Switch from `sdkApi.stream` to `sdkApi.streamWs`**

In the `sendMessage` function (line 527), change:
```typescript
for await (const chunk of sdkApi.stream(
```
to:
```typescript
for await (const chunk of sdkApi.streamWs(
```

**Step 2: Handle `ws-exit` event**

After the `done` handler, add:
```typescript
} else if (chunk.type === 'ws-exit') {
  resetTimeout();
  useStreamDebug.getState().endStream();
}
```

**Step 3: Handle `session-reset` event**

After the `config-restored` handler, add handling for `session-reset` (just `continue` — the persist call will clear the session ID).

**Step 4: Call persistMessage on done**

In the `done` handler, after `useStreamDebug.getState().endStream()`, add:

```typescript
const doneChunk = chunk as Record<string, unknown>;
sdkApi.persistMessage(
  session.id,
  (doneChunk.fullText as string) || content,
  (doneChunk.sessionId as string) || ''
);
```

**Step 5: Verify changes**

**Step 6: Commit**

```bash
cd ~/vaporforge && git add ui/src/hooks/useSandbox.ts
git commit -m "feat: switch sendMessage to WebSocket streaming"
```

---

## Task 9: Bump version to 0.20.0

**Files:**
- Modify: `package.json`
- Modify: `src/router.ts:80`

**Step 1: Update package.json version to "0.20.0"**

**Step 2: Update VF_VERSION constant in router.ts to '0.20.0'**

**Step 3: Commit**

```bash
cd ~/vaporforge && git add package.json src/router.ts
git commit -m "chore: bump version to 0.20.0 (WebSocket streaming)"
```

---

## Task 10: Build and deploy

**Step 1: Clear Docker cache**

```bash
cd ~/vaporforge && docker builder prune --all -f
```

**Step 2: Full build**

```bash
cd ~/vaporforge && npm run build
```

Expected: build succeeds.

**Step 3: Deploy**

```bash
cd ~/vaporforge && npx wrangler deploy
```

Expected: deployment succeeds.

---

## Task 11: End-to-end verification (CRITICAL)

**This task MUST NOT be skipped. Previous attempts claimed the fix worked without verifying.**

**Step 1: Open VaporForge in browser**

Navigate to https://vaporforge.jbcloud.app

**Step 2: Create or resume a session**

**Step 3: Send a test message**

> "Write a detailed explanation of how WebSocket connections work, including the upgrade handshake, framing protocol, and common use cases."

**Step 4: Observe streaming behavior**

- **PASS**: Text appears progressively (character by character or in small chunks, typing out in real-time)
- **FAIL**: Loading shimmer for 30-60s, then all text appears at once

**Step 5: Verify tool calls**

> "Create a file called test.txt in /workspace with 'Hello from WS streaming'"

Watch for: tool card appears, result renders, text before/after is correct.

**Step 6: Test stop button mid-stream**

Start a long response, click stop. Accumulated text should be preserved.

**Step 7: Check browser DevTools > Network > WS tab**

Confirm WS connection to `/api/sdk/ws` with JSON frames visible.

**Step 8: If streaming still doesn't work**

1. Check browser console for WebSocket errors
2. Check `wrangler tail` for Worker-side errors
3. Check if the WS server started in the container (look for `ws-agent-server` in process list)
4. Verify context file is being written and read correctly
5. Consider falling back to SSE (change `sdkApi.streamWs` back to `sdkApi.stream` in useSandbox.ts)

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `Dockerfile` | Modify | Add `ws` to npm install, embed ws-agent-server.js |
| `src/sandbox-scripts/ws-agent-server.js` | Create | Container WS server (~120 lines) |
| `src/sandbox.ts` | Modify | Add startWsServer, wsConnectToSandbox, writeContextFile |
| `src/api/sdk.ts` | Modify | Add GET /ws handler + POST /persist endpoint |
| `src/index.ts` | Modify | Route /api/sdk/ws through Hono |
| `src/router.ts` | Modify | Register WS route with inline auth, bump version |
| `ui/src/lib/api.ts` | Modify | Add sdkApi.streamWs + sdkApi.persistMessage |
| `ui/src/hooks/useSandbox.ts` | Modify | Switch to streamWs, handle ws-exit, call persistMessage |
| `package.json` | Modify | Bump to 0.20.0 |
