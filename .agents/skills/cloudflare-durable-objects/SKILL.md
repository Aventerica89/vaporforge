---
name: cloudflare-durable-objects
description: Official Cloudflare Durable Objects documentation. Reference when working with DurableObject classes, ChatSessionAgent, DO storage, alarms, stub.fetch(), hibernation, or WebSocket upgrades in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge's primary streaming bridge is `ChatSessionAgent`, a Durable Object that:
- Receives streaming requests from the Worker
- Manages the lifecycle of a Claude CLI session running inside a CF Container
- Bridges WebSocket connections between the browser client and the container
- Uses SQLite-backed DO storage for session state, message history, and metadata

Key VF files: `src/ChatSessionAgent.ts` (or similar), `src/api/chat.ts` (stub calls)

## API Quick Reference

Essential DO patterns used in VF:

**Class structure:**
```typescript
export class ChatSessionAgent extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) { ... }
  async fetch(request: Request): Promise<Response> { ... }
  async alarm(): Promise<void> { ... }
}
```

**Storage (SQLite in modern DO):**
- `this.ctx.storage.get(key)` -- Read a value
- `this.ctx.storage.put(key, value)` -- Write a value
- `this.ctx.storage.sql.exec(query)` -- Raw SQL (SQLite-backed DO)
- `this.ctx.storage.setAlarm(timestamp)` -- Schedule an alarm

**Stub calls from Worker:**
```typescript
const id = env.CHAT_SESSION_AGENT.idFromName(sessionId)
const stub = env.CHAT_SESSION_AGENT.get(id)
const response = await stub.fetch(request)
```

**WebSocket hibernation:**
- DO supports WebSocket hibernation for long-lived connections
- `this.ctx.acceptWebSocket(ws)` -- Accept a WebSocket for hibernation
- `webSocketMessage(ws, message)` -- Called when hibernated WS receives data
- `webSocketClose(ws, code, reason)` -- Called on WS close

## Critical Gotchas (VF-Specific)

1. **DO instances are single-threaded** -- All requests to a given DO instance execute serially. Design accordingly -- avoid blocking operations that hold the DO thread for extended periods.

2. **stub.fetch() is not a regular fetch** -- It's an RPC call to the DO. The DO's fetch() handler receives it. Headers and body work normally but there are size limits.

3. **Storage is eventually consistent across regions** -- For VF (single-region), this is not usually a problem, but don't assume storage reads always reflect the latest write in a distributed scenario.

4. **Alarms survive DO eviction** -- If the DO is evicted from memory, scheduled alarms will still fire and re-activate the DO.

5. **SQLite mode vs legacy KV mode** -- Modern DO uses SQLite. Legacy uses a KV-like API. VF should use SQLite mode (compatibility_date >= 2024-04-03 with durable_objects_enable_sqlite flag or new_sqlite_classes in wrangler.toml).

6. **WebSocket proxy pattern** -- ChatSessionAgent proxies WebSocket connections between the browser and the container. When the container's WS closes, the DO must close the browser WS too, or the client hangs.

## Full Documentation

Full reference: `references/docs.md`

Source: `https://developers.cloudflare.com/durable-objects/llms-full.txt` (547KB, complete docs)

Note: `llms.txt` (7.7KB) is just an index file pointing to llms-full.txt. The full content is in `references/docs.md`.
