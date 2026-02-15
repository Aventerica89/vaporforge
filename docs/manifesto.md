# VaporForge Streaming Manifesto

> How we solved the hardest bug in VaporForge: zero streaming in a cloud IDE.

## The Problem

VaporForge is a web-based Claude Code IDE running on Cloudflare Workers + Sandbox Containers. The core UX promise is: you type a message, Claude responds, and you watch the text stream in real-time — like every AI chat app.

**It didn't work.** For 60+ seconds, users saw a loading shimmer. No text. No progress. Then BAM — the entire response appeared at once. Nothing to everything. The app felt broken.

## The Pipeline

The streaming data flows through 4 layers:

```
Layer 1: claude-agent.js  →  stdout (Node.js process in container)
Layer 2: execStream()     →  SSE-over-RPC (Cloudflare Sandbox API)
Layer 3: Worker sdk.ts    →  TransformStream → SSE Response
Layer 4: Browser          →  fetch reader → React render
```

Every layer is a potential bottleneck. The output is only as fast as the slowest layer.

## Layer 1: Node.js Block Buffering

**Root cause:** When stdout is a pipe (not a TTY — always true inside containers), Node.js switches `process.stdout.write()` from line-buffered to **block-buffered** with a ~16KB buffer. Our `console.log(JSON.stringify({type:'text-delta', text:'Hello'}))` calls produce ~50-200 bytes each. The 16KB buffer fills slowly. Node only flushes when the buffer fills or the process exits. Most responses are under 16KB total — so nothing flushes until Claude finishes.

**Fix (v0.19.0):** Replace `console.log(JSON.stringify(obj))` with `fs.writeSync(1, JSON.stringify(obj) + '\n')`. The `fs.writeSync` call is synchronous and writes directly to file descriptor 1 (stdout), bypassing Node's stream buffering entirely. Every `text-delta` event is immediately visible.

```javascript
const fs = require('fs');

function emit(obj) {
  fs.writeSync(1, JSON.stringify(obj) + '\n');
}

// Before: console.log(JSON.stringify({ type: 'text-delta', text }));
// After:  emit({ type: 'text-delta', text });
```

We replaced all 14 `console.log(JSON.stringify(...))` calls across the agent script.

**Result:** Layer 1 now delivers data instantly. But streaming still didn't work.

## Layer 2: The Unfixable Layer

**Root cause:** Cloudflare Sandbox `execStream()` returns SSE-over-RPC. The SSE/RPC transport inside Cloudflare's infrastructure **buffers internally until the child process exits**. This is not configurable. There is no flush option. There is no workaround within the `execStream()` API.

We confirmed this by fixing Layer 1 and observing that even with unbuffered stdout, the Worker's `execStream()` reader received zero bytes until the process completed. The buffering is between the container's process and the RPC channel — inside Cloudflare's platform code.

**This layer cannot be fixed. It must be bypassed.**

## The Solution: WebSocket Tunnel (v0.20.0)

Cloudflare Sandboxes have another API: `sandbox.wsConnect(request, port)`. This establishes a **direct WebSocket tunnel** from the Worker to a TCP port inside the container. No SSE. No RPC buffering. Raw WebSocket frames, delivered instantly.

### New Architecture

```
BEFORE (broken):
  Browser → fetch SSE → Worker TransformStream → execStream() → [RPC BUFFER] → stdout

AFTER (working):
  Browser → WebSocket → Worker wsConnect() → container port 8765 → WS frames from stdout
```

### Three New Components

**1. WebSocket Agent Server** (`ws-agent-server.js` — runs inside container)

A Node.js WebSocket server on port 8765. When a connection arrives:
- Reads `/tmp/vf-pending-query.json` (context file with prompt, secrets, env vars)
- Deletes the context file immediately (secrets don't persist on disk)
- Spawns `claude-agent.js` with the query
- Pipes every stdout line as an individual WebSocket frame

```javascript
child.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n').filter(Boolean)) {
    ws.send(line);  // Each line = one frame = instant delivery
  }
});
```

**2. Worker WebSocket Handler** (`sdk.ts`)

Handles the WS upgrade request:
- Authenticates via JWT in query parameter (WebSocket connections can't carry custom headers from browsers)
- Starts the WS server in the container (idempotent — checks if already running)
- Writes the context file with prompt, OAuth token, secrets, MCP config
- Proxies the connection: `sandbox.wsConnect(request, 8765)`

**3. Frontend WebSocket Client** (`api.ts`)

An async generator that:
- Opens a WS connection to `/api/sdk/ws?token=JWT`
- Uses a push/pull queue pattern: `onmessage` pushes parsed events, `yield` pulls them
- Handles `text-delta`, `tool-start`, `tool-result`, `session-init`, `error`, `done` events
- On completion, POSTs the full response text to `/api/sdk/persist` for chat history

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| One WS per message | Fresh auth + config each time. No stale state. Simple lifecycle. |
| Context file pattern | Can't pass secrets through WS handshake. File write + read + delete is atomic enough. |
| JWT in query param | WS API doesn't support custom headers from browser. Query param is the standard workaround. |
| POST /persist | Can't use `ctx.waitUntil()` with WS responses. Browser POSTs text back after stream ends. |
| Port 8765 | Arbitrary high port. Container has full network control. |

## The Frontend: Smooth Text

Even with instant WebSocket delivery, text can arrive in bursts (multiple deltas in one frame, or frames arriving in clusters). We added a **typewriter buffer** for visual smoothness:

```typescript
function useSmoothText(rawText: string, isStreaming: boolean): string {
  // Uses requestAnimationFrame to advance a cursor through rawText
  // Default: 2 chars/frame (~120 chars/sec at 60fps)
  // Accelerates when >200 chars behind (catches up without lagging)
  // When isStreaming goes false: immediately flush all remaining text
}
```

Applied only to streaming text parts via `SmoothTextPart` component. Completed messages render instantly — no artificial delay on historical messages.

## The Docker Cache Trap

After building the new Dockerfile with `ws-agent-server.js` and the `ws` npm package, deployment said "Image already exists remotely, skipping push." The container image hash hadn't changed because Docker used cached layers.

**New sessions were still getting the OLD container image.** Even after creating fresh sessions, `ws-agent-server.js` was missing and `ws` was not installed.

Fix: `docker image prune -a -f && docker builder prune -a -f` to destroy all cached layers, then redeploy. The new image hash was different, and Cloudflare accepted it.

**Rule: Always clear Docker cache before deploying Dockerfile changes to Cloudflare Sandboxes.**

## Verification

We verified streaming works by:
1. Sending "Say hello in exactly 3 words" in a fresh session
2. Taking a screenshot 2 seconds later — captured "Hell" with a blinking cursor (mid-stream!)
3. Taking another screenshot — full response "Hello! How's going?" complete with timestamp
4. Sending a second message "Write a haiku about coding at night" — also streamed progressively
5. Confirmed: shimmer → progressive text → complete response with timestamp

Before: 60 seconds of nothing, then everything at once.
After: Text appears within 2 seconds and streams character by character.

## Lessons

1. **When debugging streaming, identify ALL buffering layers.** Fixing one layer doesn't help if another is still blocking. We fixed Node stdout (Layer 1) first, which was necessary but not sufficient.

2. **Platform APIs can have undocumented buffering.** Cloudflare's `execStream()` documentation doesn't mention that SSE/RPC buffers until process exit. We discovered this empirically.

3. **When an API is fundamentally broken for your use case, bypass it entirely.** Don't try to work around `execStream()` — use a completely different transport (`wsConnect()`).

4. **Docker layer caching can silently prevent deployments.** The image hash didn't change, so Cloudflare didn't update the container. Always clear Docker cache after Dockerfile changes.

5. **WebSocket auth from browsers requires query params.** The WebSocket API doesn't support custom headers. JWT-in-query-param is the standard pattern.

6. **Test with screenshots at timed intervals.** The only way to verify streaming is to observe the UI mid-stream. A single "did it work?" check after completion tells you nothing about progressive rendering.

## Timeline

| Version | What | Impact |
|---------|------|--------|
| v0.1.0-v0.18.0 | Used `execStream()` + SSE | Zero streaming. 60s delay. |
| v0.19.0 | Fixed Node stdout buffering (`emit()` + `fs.writeSync`) | Layer 1 fixed. Still no streaming (Layer 2). |
| v0.20.0 | WebSocket tunnel bypassing execStream entirely | Real-time streaming. 2s to first token. |

## Files

| File | Purpose |
|------|---------|
| `src/sandbox-scripts/ws-agent-server.js` | WS server in container (port 8765) |
| `src/sandbox-scripts/claude-agent.js` | Agent script with `emit()` helper |
| `src/api/sdk.ts` | Worker WS handler + persist endpoint |
| `src/sandbox.ts` | `startWsServer()`, `wsConnectToSandbox()`, `writeContextFile()` |
| `src/router.ts` | WS route with inline JWT auth |
| `ui/src/lib/api.ts` | `sdkApi.streamWs()` async generator |
| `ui/src/hooks/useSandbox.ts` | Switched from `sdkApi.stream` to `sdkApi.streamWs` |
| `ui/src/hooks/useSmoothText.ts` | Typewriter buffer hook |
| `ui/src/components/chat/MessageContent.tsx` | `SmoothTextPart` component |
| `Dockerfile` | Installs `ws` package, embeds both scripts |
