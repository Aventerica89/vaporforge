# Streaming Latency Optimization Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan from this design.

**Goal:** Reduce time-to-first-token from 8-10s (warm) / 45s (cold) to 1-2s (warm) / 15-20s (cold).

**Marketing name:** Cortex — the always-on brain layer.

---

## Problem

Every message goes through a sequential chain of container operations before the WebSocket proxy connects. Most of this work is redundant on warm messages (config unchanged, server already running, packages already installed).

### Current Sequential Chain (per message)

1. `assembleSandboxConfig()` — 8 parallel KV reads (~200-500ms)
2. `getOrWakeSandbox()` — health check + wake if sleeping (0ms warm / 2-5s cold)
3. KV write user message (~50ms, blocking)
4. `refreshMcpConfig()` — write ~/.claude.json (~100ms)
5. `npm install -g` for npx MCP packages (**0-60s — the main bottleneck**)
6. Write credential files sequentially (~100ms per file)
7. `startWsServer()` — pgrep + 500ms sleep + verify (~800ms)
8. `writeContextFile()` — write /tmp/vf-pending-query.json (~100ms)
9. `wsConnectToSandbox()` — proxy WS (~50ms)
10. Container: 150ms hardcoded wait
11. Spawn claude-agent.js + SDK query() → first token (~1-3s)

## Solution: 5 Optimizations

### 1. DO Config Cache ("Cortex")

Cache assembled SandboxConfig in the SESSIONS Durable Object.

- First message or after settings change: assemble from KV, cache in DO
- Subsequent messages: DO returns cached config (~1ms vs ~200-500ms)
- Invalidation: Settings API endpoints set a `configDirty` flag. Next message re-assembles.
- Fallback: If cache empty or >5 min old, re-assemble from KV

**Files:** `src/container.ts` (DO class), `src/config-assembly.ts`, settings API endpoints (`src/api/mcp.ts`, `src/api/secrets.ts`, `src/api/user.ts`, `src/api/plugins.ts`, `src/api/ai-providers.ts`)

### 2. Skip Redundant Container Work

Track container state in `/tmp/vf-state.json`:

```json
{
  "mcpConfigHash": "abc123",
  "npmPackagesInstalled": ["@modelcontextprotocol/server-github"],
  "wsServerPid": 1234,
  "credentialFilesHash": "def456"
}
```

- Hash MCP config before writing — skip `writeFile` + `npm install` if unchanged
- Track WS server PID — skip pgrep check if PID cached (verify once per wake)
- Hash credential files — skip writes if unchanged
- State file lives in `/tmp/`, resets on container wake (correct behavior)

**Files:** `src/sandbox.ts` (refreshMcpConfig, startWsServer methods)

### 3. Parallelize Independent Ops

Run concurrently with `Promise.all()`:

Group A (can run in parallel):
- `refreshMcpConfig()` — writes ~/.claude.json
- `startWsServer()` — pgrep check
- `writeContextFile()` — writes /tmp/vf-pending-query.json

Group B (can run in parallel, before Group A):
- `assembleSandboxConfig()` — KV reads
- `getOrWakeSandbox()` — sandbox wake

Non-blocking:
- User message KV write → move to `waitUntil()`

**Files:** `src/api/sdk.ts` (handleSdkWs function)

### 4. Eliminate Hardcoded Delays

- `startWsServer()`: Replace 500ms sleep with TCP port poll (50ms intervals, 2s max). On warm path (server running), returns immediately.
- `ws-agent-server.js`: Replace 150ms wait with file poll for context file (50ms intervals, 2s max).

**Files:** `src/sandbox.ts`, Dockerfile (ws-agent-server.js heredoc)

### 5. Cold Start Improvements

- Pre-start `ws-agent-server.js` during session creation (not first message)
- Run `npm install -g` for MCP packages at session creation/wake, not per-message
- DO config cache eliminates KV reads on wake

**Files:** `src/api/sessions.ts` (session create), `src/sandbox.ts` (wake flow)

## Expected Results

| Path | Before | After |
|------|--------|-------|
| Warm (no changes) | 8-10s | 1-2s |
| Warm (config changed) | 8-10s | 3-4s |
| Cold start | ~45s | 15-20s |

## Future: Vectorize (Phase 3, after Smart Context Phase 2)

Semantic memory search using Cloudflare Vectorize. Store embeddings of gotchas, decisions, patterns. Auto-inject relevant context per message. Deferred to backlog — needs Smart Context Phase 2 (knowledge storage) first.

## Key Files

| File | Changes |
|------|---------|
| `src/api/sdk.ts` | Parallelize ops, non-blocking KV write, DO cache reads |
| `src/sandbox.ts` | Skip redundant work, state tracking, port polling |
| `src/container.ts` | DO config cache, invalidation |
| `src/config-assembly.ts` | Cache-aware assembly |
| `Dockerfile` | ws-agent-server.js file polling, pre-start on wake |
| `src/api/sessions.ts` | Pre-start WS server, pre-install npm packages |
| Settings APIs | Config invalidation flags |
