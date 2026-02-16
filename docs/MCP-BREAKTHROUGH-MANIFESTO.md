# VaporForge: MCP Server Breakthrough Manifesto

## What This Document Covers

The complete story of making MCP servers work reliably in VaporForge's cloud sandbox containers. This was a multi-session, multi-layer debugging odyssey that uncovered three independent bugs stacked on top of each other, culminating in a solution that makes VaporForge one of the first cloud IDEs to support hot-reloadable MCP server injection with automatic dependency resolution.

---

## The Promise

MCP (Model Context Protocol) lets Claude connect to external tools -- Gmail, Slack, GitHub, databases, custom APIs. On a local machine, you add a server to `~/.claude.json` and it just works. VaporForge's promise is that this same power works in the cloud: configure your MCP servers in Settings, and the agent in your sandbox container can use them immediately.

The reality was: **it didn't work.** Users would add MCP servers, send a message, and the agent would have no idea they existed.

---

## The Architecture (How It Should Work)

```
Browser (Settings > MCP Servers)
    |
    | PUT /api/mcp/:name  -->  KV: mcp-servers:{userId}
    v
Worker (on each chat message)
    |
    | assembleSandboxConfig()  -->  reads fresh from KV
    | refreshMcpConfig()       -->  writes ~/.claude.json in container
    | CLAUDE_MCP_SERVERS env   -->  backup injection via env var
    v
Container (ws-agent-server.js)
    |
    | Spawns claude-agent.js with CLAUDE_MCP_SERVERS in env
    | claude-agent.js parses env, passes as options.mcpServers
    v
Claude SDK (query())
    |
    | Starts each MCP server (stdio: spawn process, http: connect to URL)
    | Discovers tools via JSON-RPC tools/list
    | Tools available to agent during conversation
    v
Agent uses Gmail, Slack, GitHub, etc.
```

---

## Bug 1: Stale Config (The Silent Ignorance)

**Symptom:** MCP servers added after session creation were invisible to the agent.

**Root Cause:** The `session-mcp:${sessionId}` KV key was written **once** at session creation and never updated. Both the SSE handler and WS handler read this stale key on every chat message. When a user added Gmail MCP 5 minutes after creating their session, the KV key still contained the original (empty) config.

**The Insidious Part:** Everything *looked* correct. The Settings UI saved successfully. The KV store had the right data under `mcp-servers:{userId}`. But the chat handlers were reading from a different key (`session-mcp:{sessionId}`) that was a snapshot from creation time.

**Fix:** Replace stale KV reads with fresh computation from `sandboxConfig`, which is assembled from the user's current KV data on every request.

```
BEFORE:  KV.get(`session-mcp:${sessionId}`)  // frozen at creation
AFTER:   assembleSandboxConfig() -> merge all sources fresh
```

**Commit:** `939b3df` (sdk.ts: both SSE and WS handlers)

---

## Bug 2: Missing Gemini MCP Merge (The Forgotten Source)

**Symptom:** Even after fixing Bug 1, Gemini MCP server was missing from the merged config.

**Root Cause:** `config-assembly.ts` computed `geminiMcp` config but never returned it in the assembled `SandboxConfig`. The `refreshMcpConfig()` function only merged `mcpServers` and `pluginConfigs.mcpServers`, missing the Gemini source entirely.

**Fix:** Added `geminiMcpServers` field to `SandboxConfig` interface and included it in the triple-merge:

```
mergedMcp = user servers + plugin servers + gemini servers
```

**Commit:** `939b3df` (config-assembly.ts + sandbox.ts)

---

## Bug 3: npx Download Timeout (The Silent Assassin)

**Symptom:** 15 MCP servers passed to agent, only 7 appear. No errors. No logs. Servers just vanish.

**Root Cause:** Most user-configured MCP servers use `npx` as the command (e.g., `npx -y @gongrzhe/server-gmail-autoauth-mcp`). Inside CF Sandbox containers, `npx` tries to download the npm package at runtime. The download either:
- Times out (container network is not fast)
- Fails silently (npm registry unreachable)
- Takes too long (exceeds SDK's MCP server init timeout)

The Claude SDK **silently drops** MCP servers that fail to initialize. No error event, no warning, no log. The server simply doesn't appear in the agent's available tools.

**The Pattern That Revealed It:**
- HTTP MCP servers (direct URL): always work
- stdio with `node` command (pre-installed script): always work
- stdio with `npx` command (needs download): always fail

**Fix:** Pre-install npx packages globally before the agent spawns:

```
refreshMcpConfig():
  1. Write ~/.claude.json with all merged MCP servers
  2. Scan config for servers with command === 'npx'
  3. Extract package names from args
  4. Run: npm install -g <packages> --prefer-offline
  5. Now npx finds packages locally, starts instantly
```

**Commit:** `939b3df` (sandbox.ts: refreshMcpConfig)

---

## The Debugging Timeline

| Session | What Happened |
|---------|---------------|
| Session 1 | Added MCP CRUD UI, tool discovery, credential files. Gmail still not working. |
| Session 2 | Fixed CLAUDE.md restoration, Command Center defaults, hot-reload, stdio parsing. Gmail still not working. Hypothesis: stale KV key. |
| Session 3 | Confirmed stale KV. Fixed it. Deployed. Gmail STILL not working. Added diagnostic logging. |
| Session 3 (cont.) | `wrangler tail` showed 15 servers passed, 7 appear. Realized: config is correct, servers fail to START. |
| Session 4 | Identified npx timeout pattern. Implemented pre-install. Deployed. |

**Total debugging time:** ~4 sessions across 2 days. Three bugs stacked on each other meant fixing one just revealed the next.

---

## What Makes This Special

### 1. Hot-Reloadable MCP

VaporForge now computes MCP config fresh on every message. Add a server in Settings, send a message, and the agent has it immediately. No session restart needed. No page refresh. This is hot-reload for MCP.

### 2. Automatic Dependency Resolution

The pre-install step means users can paste any npx-based MCP server config and it just works. They don't need to know about container internals, npm caching, or download timeouts. The platform handles it transparently.

### 3. Triple-Source MCP Merge

Every message merges MCP servers from three independent sources:
- **User servers** (configured in Settings)
- **Plugin servers** (discovered from installed plugins)
- **Gemini server** (auto-injected when Gemini is enabled)

This separation means each source is managed independently and merged at request time.

### 4. Diagnostic Observability

Transport-type logging shows exactly what the agent receives:
```
[sdk/ws] MCP servers for agent (15): gmail-mcp, cloudflare, notion, ...
[sdk/ws]   gmail-mcp: stdio cmd=npx
[sdk/ws]   cloudflare: http url=https://...
[sdk/ws]   gemini: stdio cmd=node
```

---

## Lessons Learned

1. **Silent failures are the hardest bugs.** The SDK dropping MCP servers without any error is the root cause of 80% of the debugging time. Always add observability at system boundaries.

2. **Stacking bugs multiply debugging time.** Bug 1 (stale config) masked Bug 3 (npx timeout). Fixing Bug 1 didn't fix the user-facing problem, which made it feel like the fix was wrong. In reality, it was correct -- there was just another bug underneath.

3. **"It works after restart" = stale cache.** This symptom always means something is cached at creation time that should be computed fresh.

4. **Container environments are not laptops.** What works with `npx` locally (fast npm cache, persistent node_modules) doesn't work in ephemeral containers (clean filesystem, slow network, tight timeouts).

5. **Fresh > Cached for mutable config.** If users can change a setting at any time, never cache it at resource creation. Always read from the source of truth.

---

## File Map

| File | Role |
|------|------|
| `src/api/mcp.ts` | MCP server CRUD, tool discovery, credential collection |
| `src/config-assembly.ts` | Assembles fresh SandboxConfig from all KV sources |
| `src/sandbox.ts` | Container lifecycle, `refreshMcpConfig()` with pre-install |
| `src/api/sdk.ts` | Chat handlers (SSE + WS), fresh config computation |
| `src/sandbox-scripts/claude-agent.js` | Parses `CLAUDE_MCP_SERVERS` env, passes to SDK |
| `src/sandbox-scripts/ws-agent-server.js` | WS server in container, env passthrough |

---

## What's Next

With MCP injection working reliably, the next phase is **MCP server management UX** (Phase 1 design at `docs/plans/2026-02-15-mcp-server-update-design.md`):
- Paste raw JSON config
- Custom headers for HTTP servers
- Environment variable injection
- Tool discovery with cached results
- Server health indicators

The hard infrastructure problem is solved. Now it's about making the Settings UI match the power of the backend.
