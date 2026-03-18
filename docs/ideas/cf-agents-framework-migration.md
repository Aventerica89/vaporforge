**Added:** 2026-03-18
**Status:** Idea
**Category:** Architecture / Framework

## Summary

Migrate VaporForge's hand-built DO/WS/MCP plumbing to CF's Agents framework (`Agent` class, `@callable`, `useAgent`, `DurableObjectOAuthClientProvider`). Reduces custom code, gets framework updates for free.

## What CF's Framework Provides vs What We Built

| What we built by hand | What CF gives you |
|---|---|
| Manual WS message routing (switch on type) | `@callable()` — decorate a method, call from React |
| Custom WS connection management | `useAgent()` hook — auto-connects, auto-syncs |
| Manual state sync over WS | `onStateUpdate` callback — React re-renders automatically |
| Custom MCP OAuth (~500 lines) | `DurableObjectOAuthClientProvider` — one import |
| Custom MCP relay transport | Built-in MCP server/client framework |
| Custom message routing in DO | `Agent` class handles routing internally |

## Key Patterns from CF Docs

### Agent Class + @callable
- Docs: https://developers.cloudflare.com/agents/guides/chatgpt-app/
- Methods decorated with `@callable()` become remotely invocable from React
- Auto-handles serialization, connection context, client state
- Replaces our manual WS message switch statements

### useAgent Hook
- Connects to DO with `onStateUpdate` callback
- State changes auto-propagate to React components
- `agent.stub.methodName()` calls DO methods directly
- Replaces our custom WebSocket management in the frontend

### MCP Integration
- MCP servers register tools and resources on the Agent
- `addMcpServer()` connects to external MCP servers with auto-OAuth
- `getMcpServers()` aggregates tools from all connected servers
- Connections persist in SQL storage

### Optimistic Sync
- Send previous state hash with mutations
- Server rejects if stale
- Client reverts on rejection
- Good pattern for file operations

## Streaming Considerations

The framework helps transport choppiness (WS-native, no HTTP buffering) but NOT rendering choppiness (still need useSmoothText for typing animation).

`onStateUpdate` syncs entire state objects, not streaming deltas. For text streaming, we'd likely keep our custom WS delta path alongside `useAgent` for state sync. Hybrid approach:
- `useAgent` for: session info, file tree, tool status, MCP state
- Custom WS for: text streaming deltas (typing animation needs per-token delivery)

## Scope

**Big.** This is a rewrite of ChatSessionAgent and the frontend WS layer. Not a weekend project — more like a v2.0 milestone.

**When to do it:** When we hit the next major architecture change (container swarm, multi-agent). We'd be rewriting the DO anyway — that's the natural time to adopt the framework.

## What We'd Delete

- `src/chat-session-agent.ts` manual WS routing → `Agent` class
- `src/mcp-oauth.ts` OAuth flow → `DurableObjectOAuthClientProvider`
- `src/mcp.ts` relay transport → built-in MCP client
- Frontend WS connection management → `useAgent` hook
- Custom state sync messages → `onStateUpdate` callback

## CF Agent Patterns (from docs)

Source: https://developers.cloudflare.com/agents/patterns/

| Pattern | VaporForge Application |
|---------|----------------------|
| **Orchestrator-Workers** | Container swarm — central DO delegates to worker containers, synthesizes results |
| **Routing** | Intent classification — code vs chat vs agency mode dispatch |
| **Evaluator-Optimizer** | Auto-review / code quality checks on sandbox output |
| **Prompt Chaining** | Multi-step tool sequences (already doing this in claude-agent.js) |
| **Parallelization** | Concurrent file operations, multi-tool execution |

## AI Model Integration (from docs)

Source: https://developers.cloudflare.com/agents/api-reference/using-ai-models/

- **Workers AI binding** (`this.env.AI.run()`) — no API keys needed, built-in
- **`createWorkersAI()` provider** — works with AI SDK `streamText`/`generateText`
- **CF AI Gateway** — caching, rate limiting, model routing via `gateway: { id }`
- **WS streaming in Agent class** — `for await (const chunk of result.textStream)` → `connection.send()`
- Could simplify QuickChat path (no API key management, built-in caching)

## Why This Matters Now

VaporForge is building increasingly complex features (container swarm, multi-agent, MCP) on top of hand-rolled DO/WS plumbing. Every new feature adds fragility to the custom infrastructure. Migrating to CF's framework before building more means:

1. **Stability** — framework-maintained connection management, state sync, error recovery
2. **Less code to maintain** — delete ~1500 lines of custom plumbing
3. **Framework updates for free** — CF improves the Agent class, we get it automatically
4. **Correct patterns** — routing, parallelization, orchestration built on tested primitives

The risk of NOT migrating: each new feature adds another layer of custom code that makes the eventual migration harder and the current system more fragile.

## Next Steps

1. **CF best practices audit first** — see `cf-workers-best-practices-audit.md`. Stabilize current code before migrating.
2. Read full `@cloudflare/agents` package docs and API reference
3. Prototype: build a minimal Agent with `@callable` + `useAgent` in a test Worker
4. Evaluate: can `useAgent` coexist with our custom WS streaming path?
5. Map: which ChatSessionAgent methods become `@callable`?
6. Timeline: align with container swarm work (both touch the DO)
