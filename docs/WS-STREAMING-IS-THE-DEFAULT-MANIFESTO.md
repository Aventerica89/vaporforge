# WebSocket Streaming Is the Default

**Date:** 2026-03-14
**Context:** Written after diagnosing a streaming regression where tokens buffered and dumped all at once instead of streaming progressively.

---

## The Invariant

`useWsStreaming` in `ui/src/hooks/useSandbox.ts` MUST default to `true`.

```typescript
// CORRECT — WS on unless explicitly disabled
useWsStreaming: localStorage.getItem('vf_use_ws') !== '0',

// WRONG — WS off unless explicitly enabled (regression pattern)
useWsStreaming: localStorage.getItem('vf_use_ws') === '1',
```

**Do not change this without reading and understanding this document.**

---

## Why WebSocket Works and HTTP Doesn't

Cloudflare's HTTP response streaming has a platform-level buffering behavior: chunks smaller than ~1KB are held before delivery to the browser's `ReadableStream`. This isn't a bug. It isn't fixable. It's how CF's edge networking works.

The VaporForge streaming path is:

```
Container (claude-agent.js)
  → outbound WS to DO (/internal/container-ws)
    → ChatSessionAgent DO bridges frames to browser WS
      → Browser receives each NDJSON frame immediately
```

Each NDJSON line from the container arrives as a WebSocket frame. WS frames are delivered immediately at the protocol level — no buffering layer, no threshold, no padding tricks required. The token appears in the browser the instant it leaves the container.

The HTTP path attempts to replicate this by:
1. Forwarding each WS frame to an HTTP bridge writer with 1KB padding
2. Relying on `EventSourceParserStream` to parse the padded chunks
3. Hoping Chrome's Fetch API delivers each padded chunk without further buffering

This works sometimes. It fails silently others. It requires the 1KB pad, correct `\n\n` SSE separators, and fire-and-forget write semantics that have no backpressure. Every one of those is a failure point that doesn't exist in the WS path.

---

## The Regression Pattern

This manifesto was written after a specific incident:

1. A feature branch added the HTTP streaming path (V1.5) to `handleContainerWsMessage`
2. The branch was merged with `useWsStreaming` defaulting to `=== '1'` (opt-in)
3. This meant: new users, users who cleared localStorage, users on new devices — all got HTTP
4. Those users saw "loads for a while, then dumps everything at once"
5. The fix was one character: `=== '1'` → `!== '0'`

The actual streaming architecture was fine. The frame forwarding code was structurally correct. Only the default was wrong. But a wrong default is indistinguishable from a broken architecture to someone watching the UI.

---

## The Correct Mental Model

```
WS streaming:  always on, opt-out via localStorage.setItem('vf_use_ws', '0')
HTTP streaming: fallback, opt-in via localStorage.setItem('vf_use_ws', '0')
```

The HTTP path exists for debugging and for edge cases where WS connections fail. It is not the production path. It is not the path described in the architecture docs. It is not what the manifesto (`docs/manifesto.md`) is written around.

---

## The Rule

**Never make WS streaming opt-in.** The correct check is `!== '0'`, not `=== '1'`.

Any PR that changes `useWsStreaming`'s default to false (or its condition to `=== '1'`) must come with a documented reason, a plan for handling the HTTP buffering problem, and explicit acknowledgment that new users will hit the buffering path.

No such PR should be merged without that documentation.

---

## What to Do If Streaming Is Broken

1. Open DevTools → Network → WS connection for the chat request
2. Click the Messages tab
3. If you see individual `0:"token"` frames arriving with timestamps a few milliseconds apart, streaming is working. The bug is in the React rendering layer (check `useSmoothText`, `MessageList`, `isStreaming` state).
4. If you see a single large frame arrive all at once, check `useWsStreaming` default first.
5. If `useWsStreaming` is correct and you still see batching, check `handleContainerWsMessage` in `ChatSessionAgent` — the bridge forwarding may be accumulating frames.
