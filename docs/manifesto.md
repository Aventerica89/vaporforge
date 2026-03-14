# VaporForge Manifesto

## What This Is

VaporForge is a web-based Claude Code IDE that runs on Cloudflare's edge infrastructure. It lets you use your existing Anthropic Pro or Max subscription from any device — phone, tablet, borrowed laptop, whatever's in front of you — without installing anything, without paying for API credits, and without giving up the full Claude Code experience.

That's the pitch. Here's why it's hard and what we did about it.

---

## The Core Problem

When you pay for Claude Pro or Max, you get access to one of the most capable coding agents available. But that agent is installed as a CLI tool on one machine. Specifically, your machine. The one at your desk.

You're away from your desk. You have a laptop with nothing installed. You're on your phone. You're on a company machine you can't touch. Your subscription is sitting there, idle, 80% of the time.

The obvious solution is a web interface. The non-obvious part is doing it without either (a) requiring users to paste in raw API keys, or (b) making them wait 23 seconds before seeing their first token.

Those were the two problems that defined everything else.

---

## Why OAuth, Not API Keys

Anthropic's Claude subscription (Pro, Max) authenticates via OAuth. When you run `claude setup-token` locally, the CLI exchanges credentials for a long-lived OAuth token (`sk-ant-oat01-*`). That token represents your subscription. It's not a pay-per-token API key — it's proof that you're a paid subscriber.

VaporForge uses this token. The setup flow:

1. Run `claude setup-token` once on any machine that has Claude installed.
2. Paste the resulting token into VaporForge.
3. We validate it against `api.anthropic.com/v1/oauth/token`.
4. On success, we create your account and store the token server-side (encrypted, per-user in KV).
5. Your browser gets a session JWT. That's it.

No API key. No credit card required beyond your existing subscription. You use Claude the same way you would locally — because it actually is the same token, running the actual Claude Code CLI, inside a container we manage for you.

One critical constraint: OAuth tokens work with `@anthropic-ai/sdk` in Node.js (via the `authToken` field), but they do NOT work with `@ai-sdk/anthropic` in Cloudflare Workers. This is a CF Workers / Vercel AI SDK limitation, not an Anthropic limitation. The implication: the main agentic chat session runs inside a container (Node.js), not in the Worker directly. Secondary features like QuickChat, code transform, and commit message generation require explicit API keys stored separately — they run in the Worker and must use `@ai-sdk/anthropic`.

This distinction matters. Never conflate them.

---

## Why Cloudflare, Not a VPS

A traditional architecture for this would be: user connects, spin up a VM or Lambda, run the CLI, proxy responses back. Simple.

The problems:

- **Lambda has a 15-minute execution limit.** Claude can take longer. Tool use, large codebases, complex agents — they run long.
- **Lambda/VPS can't hold a WebSocket open indefinitely.** The connection dies, the session dies.
- **VPS requires provisioning.** Startup latency is seconds to minutes. Users won't accept that.
- **Lambda buffers HTTP responses.** You can't stream tokens to the browser from a Lambda-originated request in all configurations.

Cloudflare's combination of Workers + Durable Objects + Containers sidesteps all of this:

- **Workers** handle auth, routing, and fast-path requests (QuickChat, transform, analyze) at the edge. Sub-millisecond routing, no cold start.
- **Durable Objects** are stateful, long-lived, single-instance objects that survive the 30-second Worker request limit. They hold the streaming session open as long as needed. They're the bridge between the container and the browser.
- **Containers** (CF Sandboxes) are persistent compute instances. They start in seconds, run indefinitely as long as they're active, and have a real filesystem. This is where the Claude Code CLI runs.

The container is standard-3: 2 vCPU, 8 GiB RAM. Enough to clone a repo, run tests, run build tools, do real work.

---

## The Streaming Problem

This is the part that took the longest to get right.

The naive approach: container runs the Claude CLI, outputs tokens to stdout, you pipe stdout back to the browser via HTTP. Easy.

Cloudflare broke this in a non-obvious way.

Cloudflare's Durable Object HTTP request handler buffers the entire response before dispatching it to the next handler. The documentation doesn't shout this. You find it by watching your browser wait 23 seconds (the full duration of a response) and then receiving all the tokens at once. Everything pops in simultaneously. No streaming.

We tried the obvious workaround: make the container POST its output back to the DO in chunks. Same result. The DO HTTP handler buffers the entire POST body before calling your handler. You can't stream in either direction through a DO using HTTP.

The fix: WebSockets.

WebSocket frames are delivered immediately, per-message, without buffering. The solution:

1. Container opens an outbound WebSocket to `/internal/container-ws` on the DO.
2. Each NDJSON token line becomes a WebSocket text frame.
3. The DO receives frames in real-time via `webSocketMessage()`.
4. The DO writes each frame to the browser's HTTP response immediately.

This is the architecture that actually works. The container→DO leg is WebSocket. The DO→browser leg is HTTP streaming (with a `TransformStream` and `ReadableStream`). The DO is the relay.

The current path:

```
Browser POST /api/v15/chat
  → Worker validates JWT, routes to ChatSessionAgent DO
  → DO calls sandbox.startProcess() with VF_WS_CALLBACK_URL env var
  → Container claude-agent.js opens outbound WS to /internal/container-ws
  → Worker validates JWT (?token=), upgrades and routes to same DO
  → DO tags the socket container:{executionId}, bridges to browser HTTP response
  → Each token = one WS frame = one NDJSON line in the browser's stream
```

One more gotcha: Chrome buffers HTTP response chunks smaller than ~1KB before delivering them to `reader.read()`. Even with WebSocket-backed real-time data arriving at the DO, the browser won't see tokens until 1KB has accumulated. The fix: pad each write to the browser response to exceed 1KB. The padding is whitespace; the client skips blank lines.

Then there's the SSE separator issue. `EventSourceParserStream` requires `\n\n` after each `data:` line to dispatch an event. Even with chunking, omitting the double newline causes all events to queue until EOF. The padding and the separator have to be combined in a single write — if they're separate chunks, Chrome can still buffer the small `\n\n` chunk.

All of this is in `ChatSessionAgent.handleContainerStream()` and `src/api/quickchat.ts:padStreamLines()`.

---

## Walk-Away Persistence

This is the other thing that separates VaporForge from a naive proxy.

If you close your browser tab while Claude is mid-execution, the session does not die. The container keeps running. The DO keeps buffering the stream. When you reconnect, the DO replays the buffered output and you see everything that happened while you were away.

This works because the DO and the container are decoupled. The browser connection is just a consumer of the stream. The stream's source of truth is the DO's buffer. The container doesn't know or care whether anyone is watching.

The DO also runs a sentinel alarm every 8 minutes to ping the container, resetting its idle timer. Without this, Cloudflare would terminate the container after 10 minutes of inactivity.

---

## What We Refuse to Do

**No polling.** Polling introduces latency, wastes compute, and produces a janky experience. Every streaming path in VaporForge uses real push transport — WebSocket or HTTP streaming. If a transport doesn't support real-time push, we don't use it.

**No buffering until done.** The 23-second pop-in issue is a regression, not a shipping decision. When CF's transport layer imposed buffering on us, we found a different transport (WebSocket). We didn't accept the degraded UX.

**No fake streaming.** `useSmoothText` animates text arrival for visual smoothness, but it operates on real token data as it arrives. It doesn't simulate streaming by dripping out pre-received content. The animation advances a cursor through actual buffered text. If the network is fast, the cursor catches up. If it's slow, the animation renders what's arrived.

**No raw API keys in the main flow.** The primary session path uses the user's OAuth token from their existing subscription. We don't ask users to expose their API keys to run the main agent. QuickChat and transform features require API keys because of the CF Workers / `@ai-sdk/anthropic` OAuth limitation — that's a documented constraint, not a design preference.

**No single-machine lock-in.** The entire point of this project is that your compute is remote and persistent. Your session on an iPad is the same session as your MacBook. Same history, same workspace, same running process.

---

## What Lives Where

The architecture has two distinct compute contexts:

**Cloudflare Worker (edge, stateless per-request):**
- Auth, JWT validation
- Request routing
- QuickChat, code transform, commit message generation (via AI SDK + API keys)
- File operations (R2)
- Session management API

**Container (persistent, stateful, per-session):**
- Claude Code CLI (`claude-agent.js` via `@anthropic-ai/sdk` with OAuth token)
- MCP servers (stdio transport)
- File system (`/workspace`)
- Real-time streaming output via outbound WebSocket

**Durable Object (long-lived bridge):**
- Holds browser HTTP connection open
- Accepts container WebSocket
- Bridges frames between the two
- Buffers for replay
- Keepalive sentinel

The Worker is stateless and fast. The Container is stateful and capable. The DO is the connective tissue.

---

## On the Claude SDK in Containers

The container runs `@anthropic-ai/sdk` in Node.js, not `@ai-sdk/anthropic`. These are different packages with different behavior.

`@anthropic-ai/sdk` accepts `authToken` for OAuth tokens. `@ai-sdk/anthropic` does not. This is why the main session must run in a container, not directly in a Worker.

Additionally: the Node.js version in the `cloudflare/sandbox` base image is older than 22.4, which means no native WebSocket global. Container scripts must `require('ws')` (the npm package). Using `new WebSocket()` causes a `ReferenceError` at module load and a silent code 1 exit. The error is nearly invisible without direct container log access.

The `IS_SANDBOX: '1'` environment variable must be set in the container or the Claude CLI exits with code 1 immediately. This is non-negotiable.

When passing environment variables to `startProcess()`, the `env` option completely replaces the container's existing environment — it does not merge. Always spread `...process.env` first, then add your custom variables. Forgetting this causes the Claude CLI to fail silently because PATH, HOME, and NODE_PATH are missing.

---

## The Agency Mode Extension

VaporForge has a visual website editor mode (Agency, v0.25.0+). The idea: connect a GitHub repo containing an Astro site, click on a component in a live preview, describe the edit, and Claude modifies the source.

The implementation injects a custom inspector script (`vf-inspector.js`) into the Astro dev server's public directory. Container-side, a script walks the `.astro` files and adds `data-vf-component`/`data-vf-file` attributes to root elements. The browser-side inspector picks these up and posts `vf-select`/`vf-tree` messages via `postMessage` to the parent frame.

The Astro Dev Toolbar is disabled entirely (`ASTRO_DISABLE_DEV_OVERLAY=true`) because it has its own Inspect mode that conflicts with the VF inspector.

External links are intercepted in the iframe to prevent navigation away from the preview.

This mode uses the same container/DO/browser architecture as regular chat — it's the same streaming pipeline, same auth, same session persistence. The difference is the workspace contains a cloned repo with a running dev server instead of an empty directory.

---

## Summary

VaporForge exists because Claude Code is powerful and its value is largely inaccessible when you're away from your primary machine.

The architecture choices were driven by specific technical constraints:
- OAuth tokens require Node.js containers, not CF Workers
- Real-time streaming requires WebSockets through the DO layer (HTTP is buffered)
- Long-running sessions require Durable Objects (Worker requests have a 30-second ceiling)
- Walk-away persistence requires the DO to buffer and replay independently of browser state

Every significant design decision traces back to one of those constraints. The system is not complicated for its own sake. It's as simple as the constraints allow.

The goal is straightforward: when you open VaporForge, you have the full Claude Code experience, from any device, using the subscription you already pay for.
