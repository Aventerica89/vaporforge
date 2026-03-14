# Relay L2 Prompt — VaporForge Streaming Architecture Overhaul

## Task

VaporForge is a web-based Claude Code IDE running on Cloudflare Workers + Containers. Its main chat streaming is fundamentally broken after 6 sessions of incremental fixes, each introducing new regressions. Cloudflare's own reference platform (VibeSDK) uses a different architecture and streaming works perfectly. We need to adopt VibeSDK's approach.

**Core question:** How do we adopt VibeSDK's `@cloudflare/ai-chat` + `useAgentChat` streaming architecture for VaporForge, given that VF runs the Claude CLI binary in a container (not `streamText()` from the DO)? Specifically: Can the DO translate container NDJSON output into AI SDK's UIMessageStream protocol and serve it over WebSocket so the browser can use `useAgentChat` natively? What are the gaps, and what's the minimal viable adapter?

---

## Architecture Comparison

### VibeSDK (Cloudflare's reference platform — works perfectly)

```
Browser ↔ WebSocket ↔ CodeGeneratorAgent DO (extends AIChatAgent)
                              |
                              ├── streamText() → toUIMessageStreamResponse()
                              ├── SQLite: messages, stream chunks, tool approvals
                              └── Container (sandbox for user apps, NOT for LLM)
```

- `AIChatAgent` from `@cloudflare/ai-chat` extends CF Agents SDK `Agent`
- Browser uses `useAgentChat` hook (from `agents/ai-react`) — handles ALL streaming UI state
- DO calls `streamText()` directly with LLM APIs → `toUIMessageStreamResponse()` converts to AI SDK stream protocol
- WebSocket frames arrive instantly — no buffering, no padding, no animation hacks
- Resumable streaming: SQLite buffers chunks; on reconnect, client gets buffered + live
- Hibernation-safe: stream position, tool approvals, messages all persist in DO SQLite
- Zero custom streaming animation code on the frontend

**Key code pattern:**
```typescript
// DO side (extends AIChatAgent)
async onChatMessage() {
  const result = streamText({
    model: workersai("@cf/model"),
    messages: await convertToModelMessages(this.messages),
  });
  return result.toUIMessageStreamResponse();
}

// Browser side
const agent = useAgent({ agent: "ChatAgent" });
const { messages, sendMessage, status } = useAgentChat({ agent });
```

### VaporForge (broken — 6 layers of hacks)

```
Browser ↔ HTTP POST ↔ Worker ↔ ChatSessionAgent DO ↔ Container
                                     ↑                    |
                                     └── HTTP POST /internal/stream (NDJSON callback)
```

- ChatSessionAgent DO is a plain Durable Object (not AIChatAgent)
- Container runs actual Claude CLI binary via `startProcess()`
- Claude CLI streams output as NDJSON to a callback URL on the DO (`/internal/stream`)
- DO pipes NDJSON events through to browser via HTTP chunked response
- Browser parses NDJSON manually → custom Zustand store → custom `useSmoothText` rAF animation
- Chrome buffers HTTP chunks <1KB → requires 1KB whitespace padding on every write

**The fundamental problem:** HTTP chunked transfer + Chrome's ReadableStream buffering + React 18 automatic batching = text-delta events arrive but never animate. They pop in all at once.

### The 6 Hack Layers (each introduced new bugs)

1. `socket.setNoDelay(true)` in claude-agent.js — disable TCP Nagle
2. 1KB whitespace padding on every DO bridge write — force Chrome ReadableStream flush
3. `useSmoothText` rAF rewrite — requestAnimationFrame loop, 4 chars/frame, 3x catch-up
4. StreamingMessage linger — stay mounted 700ms+ after isStreaming→false
5. `useSandboxStore.subscribe()` — capture streaming parts before React 18 batching clears them
6. `key="streaming-text"` — prevent SmoothText remount when text part shifts array index

**Current symptoms:** Text pop-in (no animation), duplicate messages (linger + committed message both render), 2-minute hangs, "Stream stopped" errors (5-min AbortController timeout).

---

## VF's Key Constraint

VF is a **cloud terminal** running the actual Claude CLI in a container. It does NOT call LLM APIs directly from the DO like VibeSDK does. The streaming challenge is proxying Claude CLI stdout through:

```
Container (claude-agent.js spawns Claude CLI)
  → stdout parsed into NDJSON events
  → HTTP POST to DO callback URL (/internal/stream)
  → DO pipes events to browser HTTP response
  → Browser parses NDJSON → Zustand → React render
```

VibeSDK's `streamText()` returns an AI SDK result that natively converts to `toUIMessageStreamResponse()`. VF doesn't have that — it has raw NDJSON from a CLI process.

### Container NDJSON Event Format (claude-agent.js)

The container emits these NDJSON event types:
```json
{"type":"text-delta","text":"Hello"}
{"type":"tool-start","toolCallId":"toolu_123","name":"Read","input":{}}
{"type":"tool-result","toolCallId":"toolu_123","result":"file contents..."}
{"type":"reasoning-delta","text":"thinking..."}
{"type":"done","usage":{"inputTokens":1234,"outputTokens":567}}
{"type":"error","message":"something failed"}
```

### AI SDK UIMessageStream Protocol (what useAgentChat expects)

AI SDK uses a line-based text protocol with type prefixes:
```
0:"Hello"                          // text delta
9:{"toolCallId":"toolu_123",...}   // tool call start
a:{"toolCallId":"toolu_123",...}   // tool result
g:{"text":"thinking..."}           // reasoning delta
e:{"finishReason":"stop",...}      // finish
d:{"finishReason":"stop",...}      // done
```

Each line is a complete event. Lines are separated by `\n`.

---

## What We Want

1. **Replace the browser-facing transport** from HTTP chunked to WebSocket
2. **Replace custom Zustand streaming state** with `useAgentChat` from AI SDK
3. **Strip all 6 hack layers** — no padding, no linger, no subscribe, no stable keys, no useSmoothText (or make it optional polish only)
4. **Keep the container→DO path as-is** (HTTP NDJSON callback works fine server-to-server)
5. **Maintain walk-away persistence** — DO should still collect container output while browser is disconnected
6. **Maintain tool rendering** — VF has custom tool UIs (create_plan, ask_user_questions) that intercept tool-start events

### Proposed Adapter Pattern

```
Container → NDJSON → DO (ChatSessionAgent)
                       ├── SQLite buffer (for resumable streaming)
                       ├── Translate NDJSON → AI SDK UIMessageStream protocol
                       └── WebSocket → Browser (useAgentChat)
```

The DO becomes a protocol translator: receives container NDJSON, converts each event to the AI SDK stream format, sends over WebSocket. The browser uses `useAgentChat` which handles all streaming UI state natively.

---

## Questions for You

1. **Is the NDJSON→UIMessageStream translation feasible?** The event types map roughly 1:1. Are there edge cases or protocol requirements that make this harder than it looks?

2. **Can `useAgentChat` work with a custom WebSocket transport** that isn't backed by `streamText()`? Or does it expect specific server-side behavior from `AIChatAgent`?

3. **Should we extend `AIChatAgent`** and override `onChatMessage()` to pipe container NDJSON through it? Or build a lighter adapter that just speaks the WebSocket protocol without the full `@cloudflare/ai-chat` dependency?

4. **What about tool rendering?** VF has custom tool UIs that intercept `tool-start` events by name. Does `useAgentChat` support custom tool rendering, or would we lose this?

5. **Resumable streaming:** VF already has replay via `GET /api/sdk/replay/:sessionId`. `@cloudflare/ai-chat` has SQLite-buffered resumable streaming built in. Which approach is better for VF's use case (long-running Claude sessions that can last hours)?

6. **What's the minimal viable change?** Can we do this incrementally (WebSocket transport first, then useAgentChat, then strip hacks) or does it need to be atomic?

---

## Reference URLs (for web search)

- AI SDK useChat: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
- AI SDK streaming: https://ai-sdk.dev/docs/foundations/streaming
- AI SDK tools: https://ai-sdk.dev/docs/foundations/tools
- AI SDK UIMessageStream protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- @cloudflare/ai-chat README: https://github.com/cloudflare/agents/blob/main/packages/ai-chat/README.md
- CF Agents SDK: https://developers.cloudflare.com/agents/
- VibeSDK repo: https://github.com/cloudflare/vibesdk
- Anthropic Agent SDK streaming: https://platform.claude.com/docs/en/agent-sdk/streaming-output

---

## Deliverable

Provide a concrete implementation plan:
1. Which components change (DO, container, frontend)
2. The NDJSON→UIMessageStream mapping (event by event)
3. Whether to use `AIChatAgent` or build a lighter adapter
4. How tool rendering works with the new architecture
5. How walk-away persistence / resumable streaming works
6. Migration path (can we run old HTTP + new WS in parallel during transition?)
7. What gets deleted (which of the 6 hack layers, which custom hooks, which Zustand state)
