# Smart Context System — Design Document

> **Origin:** A user asked Claude inside VaporForge: "What would make working with you seamless?" Claude's response became this design. The AI is designing its own product improvements.
>
> **Source:** [Claude Advice — Notion](https://www.notion.so/Claude-Advice-309cc9ae33da80a69b84d4fcc258ed1f)

**Goal:** Make every VaporForge session feel like Claude has been on the project for months, not starting fresh.

**Architecture:** Extend the existing session creation pipeline (config-assembly.ts + sandbox.ts) with auto-generated context injection alongside the existing CLAUDE.md/rules/agents/MCP injection.

---

## The Problem

Today, Claude inside a VaporForge sandbox starts each session knowing:
- CLAUDE.md (user-written project instructions)
- VF rules from Command Center
- MCP servers, secrets, agents, commands, plugins

What it does NOT know:
- What happened in the last session
- Current git state (branch, recent commits, uncommitted changes)
- Active TODOs and FIXMEs in the codebase
- Why past decisions were made
- What broke before and how it was fixed
- File dependency relationships

Users compensate by writing extensive CLAUDE.md files or repeating context every session. VaporForge should do this automatically.

---

## Design: 3 Features, Phased

### Feature 1: Session Auto-Context (Highest Impact)

**What:** On every session creation, run a context-gathering script inside the container and prepend the output to the first message context.

**When it runs:** After `sandbox.createSandbox()` completes and before the first user message is sent. The WS agent server (`ws-agent-server.js`) would execute this before spawning `claude-agent.js`.

**What it gathers:**

```
## Project State (auto-generated)

### Git
Branch: main
Status: 2 modified, 1 untracked
Last 5 commits:
  7d502fb chore: vapor-sync — update specs, docs, and landing page to v0.21.2
  501336b docs: add /vapor-sync command + MCP breakthrough manifesto
  939b3df fix(mcp): fresh config + npx pre-install for stdio servers
  ...

### TODOs in codebase
src/api/quickchat.ts:42: TODO: add rate limiting
ui/src/components/Editor.tsx:180: FIXME: Monaco resize on panel change

### Previous session summary (if exists)
Last worked on: MCP credential file upload
Status: Complete, deployed as v0.21.2
Next steps: Smart context system design
```

**Implementation approach:**

1. **Context script in container** — `ws-agent-server.js` runs a lightweight bash script on startup:
   ```bash
   # /opt/claude-agent/gather-context.sh
   echo "## Project State (auto-generated at $(date -u +%Y-%m-%dT%H:%M:%SZ))"
   echo ""
   echo "### Git"
   cd /workspace
   git branch --show-current 2>/dev/null && echo ""
   git status --short 2>/dev/null | head -20
   echo ""
   echo "Last commits:"
   git log --oneline -5 2>/dev/null
   echo ""
   echo "### TODOs"
   grep -rn "TODO\|FIXME\|HACK" --include="*.ts" --include="*.tsx" --include="*.js" /workspace/src/ 2>/dev/null | head -15
   echo ""
   # Load previous session summary if it exists
   if [ -f /workspace/.vaporforge/session-summary.md ]; then
     echo "### Previous Session"
     cat /workspace/.vaporforge/session-summary.md
   fi
   ```

2. **Injection point** — The gathered context is written to `/tmp/vf-auto-context.md`. The `claude-agent.js` reads it and prepends to the system prompt or first user message.

3. **User toggle** — Settings > Command Center gets a toggle: "Auto-inject project context on session start" (default: ON).

4. **KV storage for session summaries** — Key: `session-summary:{userId}:{sessionId}`. Written at session end or by explicit `/summarize` command. Loaded into next session on the same repo.

**Files to modify:**
| File | Change |
|------|--------|
| `Dockerfile` | Add `gather-context.sh` script |
| `src/sandbox-scripts/ws-agent-server.js` | Run context script on startup, write to `/tmp/vf-auto-context.md` |
| `src/sandbox-scripts/claude-agent.js` | Read auto-context and prepend to system prompt |
| `ui/src/components/settings/CommandCenterTab.tsx` | Add toggle for auto-context |
| `src/api/sessions.ts` | Pass auto-context preference to sandbox config |

**Estimated effort:** Small — mostly a bash script + 10 lines in claude-agent.js to read and inject.

---

### Feature 2: Gotchas & Decisions Capture

**What:** When Claude resolves a tricky bug or makes an architectural decision during chat, offer to save it as a persistent knowledge entry that future sessions can reference.

**How it works:**

1. **Detection** — Claude (inside the sandbox) naturally recognizes when it's solved a non-obvious problem. The CLAUDE.md instructions tell it to offer saving gotchas.

2. **Storage format** — Markdown files in `/workspace/.vaporforge/knowledge/`:
   ```
   /workspace/.vaporforge/
     knowledge/
       gotchas.md          # Problems encountered and fixes
       decisions.md        # Architecture Decision Records
   ```

3. **Gotcha format:**
   ```markdown
   ## Database Connection Exhaustion (2026-02-16)
   **Problem:** App crashes under load with "too many connections"
   **Cause:** Prisma clients not disconnected in serverless functions
   **Fix:** Added `prisma.$disconnect()` in cleanup, set pool limit to 20
   **File:** src/lib/db.ts
   **Prevention:** Always use connection pooling; never create Prisma client per-request
   ```

4. **Decision format:**
   ```markdown
   ## Chose WebSocket over SSE for streaming (2026-02-15)
   **Context:** CF Sandbox execStream() buffers internally — SSE unusable for progressive rendering
   **Options considered:** (1) SSE via execStream, (2) WebSocket tunnel via wsConnect, (3) Long-polling
   **Decision:** WebSocket tunnel — bypasses all CF internal buffering
   **Trade-offs:** One WS connection per message (no connection reuse), but true real-time streaming
   **Consequence:** Need ws-agent-server.js running in container on port 8765
   ```

5. **Injection** — The `gather-context.sh` script (from Feature 1) reads these files and includes them in the auto-context. Claude sees past gotchas and decisions at the start of every session.

6. **VaporForge UI** — Add a "Knowledge" section to the file explorer sidebar that shows `.vaporforge/knowledge/` files with a special icon. Users can also view/edit them from Settings.

**How capture is triggered:**

Option A (simplest): Add to VF rules in Command Center:
```
When you resolve a non-obvious bug or make a significant architectural decision,
offer to save it by writing to /workspace/.vaporforge/knowledge/gotchas.md or
decisions.md. Append, don't overwrite. Use the format documented at the top of each file.
```

Option B (richer): A dedicated `/capture` slash command that Claude runs to extract and format the knowledge entry from the current conversation context.

**Files to modify:**
| File | Change |
|------|--------|
| `src/sandbox.ts` | Create `.vaporforge/knowledge/` directory on session start |
| `src/api/user.ts` | Default VF rules updated to include capture instructions |
| `Dockerfile` | Include gotchas.md and decisions.md templates |
| `ui/src/components/FileExplorer.tsx` | Special icon for .vaporforge/ directory |

**Estimated effort:** Small for Option A (just VF rules update + directory creation). Medium for Option B (new command + UI).

---

### Feature 3: Session Handoff Summary

**What:** When a session ends (container timeout, explicit close, or browser close), auto-generate a summary of what happened and store it for the next session.

**How it works:**

1. **Generation** — Before the container shuts down, Claude generates a summary. Two trigger paths:
   - **Explicit:** User clicks "End Session" or runs `/end` — Claude writes summary before shutdown
   - **Implicit:** Container timeout approaching — `ws-agent-server.js` detects inactivity and triggers a final summary generation

2. **Storage** — Written to two places:
   - `/workspace/.vaporforge/session-summary.md` (in the container filesystem, persists if workspace is mounted)
   - KV: `session-summary:{userId}:{repoPath}` (persists across container restarts)

3. **Format:**
   ```markdown
   ## Session Summary (2026-02-16T07:30:00Z)

   ### What was done
   - Implemented MCP credential file upload (v0.21.1)
   - Fixed fresh config per message bug (v0.21.2)
   - Deployed both fixes to production

   ### Current state
   - All tests passing
   - Branch: main, clean working tree
   - Deployed: v0.21.2 live on vaporforge.jbcloud.app

   ### Next steps
   1. Design smart context system (this doc)
   2. MCP Phase 2: OAuth auto-trigger
   3. Stripe billing integration

   ### Open questions
   - Should session summaries persist per-repo or per-session?
   - How long to keep summaries in KV? (suggest 30 days)
   ```

4. **Loading** — Feature 1's `gather-context.sh` reads the summary file. If the file doesn't exist in the container (new container), the Worker injects the KV-stored summary via the context file pattern (`/tmp/vf-pending-query.json` already supports arbitrary context).

**Files to modify:**
| File | Change |
|------|--------|
| `src/sandbox-scripts/ws-agent-server.js` | Inactivity timer that triggers summary |
| `src/sandbox-scripts/claude-agent.js` | Handle `generate-summary` command type |
| `src/api/sdk.ts` | Persist endpoint extended to save session summaries to KV |
| `src/api/sessions.ts` | Load previous summary from KV when creating new session on same repo |
| `src/sandbox.ts` | Inject previous summary into container context file |

**Estimated effort:** Medium — needs inactivity detection, new message type in WS protocol, KV read/write.

---

## Implementation Order

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Session Auto-Context | Small | High — instant project awareness |
| 2 | Gotchas & Decisions Capture (Option A) | Small | Medium — grows over time |
| 3 | Session Handoff Summary | Medium | High — seamless continuity |

Phase 1 alone delivers the biggest improvement: Claude starts every session already knowing git state, TODOs, and (if saved) what happened last time. Phases 2-3 build the flywheel — the more sessions a user has, the smarter Claude gets about their project.

---

## What This Achieves

The user's original question was: "What would make working with you seamless?"

With these 3 features:
- **No repeated context** — Auto-context gives instant project awareness
- **No repeated mistakes** — Gotchas persist across sessions
- **No lost decisions** — ADRs keep architectural consistency
- **No "where was I?"** — Session summaries bridge conversations
- **No manual CLAUDE.md maintenance** — Knowledge accumulates automatically

The result: VaporForge sessions feel like continuing a conversation with a teammate, not starting over with a stranger.

---

## Relation to Existing Systems

| Existing | Smart Context Extension |
|----------|----------------------|
| CLAUDE.md (static instructions) | Auto-context (dynamic project state) |
| Command Center (VF rules) | Capture instructions (tell Claude to save gotchas) |
| Session persistence (chat history) | Session summaries (distilled context, not raw chat) |
| Secrets (env vars) | Knowledge base (project-specific docs) |
| MCP servers (external tools) | Dependency map (internal code relationships) |

Smart Context is not a replacement — it's the dynamic layer on top of the existing static configuration.
