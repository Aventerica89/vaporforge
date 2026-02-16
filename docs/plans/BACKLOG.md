# VaporForge Feature Backlog

> Persistent record of planned features. Check items off as they ship.
> Items are grouped by effort tier so future sessions know what's quick vs. what's a major undertaking.
>
> **Effort key:** `[FREE]` = VF rules text or shell script, no code. `[S]` = small, <1 session. `[M]` = medium, 1-2 sessions. `[L]` = large, multi-session. `[XL]` = major feature, multi-week.

---

## Shipped

<details>
<summary>Completed features (click to expand)</summary>

### MCP Server Management
- [x] **Paste JSON Config to Add** — Parse mcpServers JSON blobs from docs/Claude Code/Warp (Phase 1, v0.21.0)
- [x] **Custom Headers** — Key-value pairs for HTTP server auth tokens (Phase 1, v0.21.0)
- [x] **Env Vars per Server** — Key-value pairs for stdio server credentials (Phase 1, v0.21.0)
- [x] **Expandable Tool List** — Show available tools as pill badges per server (Phase 1, v0.21.0)
- [x] **Credential File Upload** — Upload service account JSON, PEM keys, etc. per server. Injected to container filesystem. (v0.21.1)
- [x] **Multi-File Credentials** — Multiple credential files per server with path auto-injection into CLAUDE.md (v0.21.2)
- [x] **Fresh Config per Message** — MCP config recomputed on every message, not cached from session creation (v0.21.2)
- [x] **npx Pre-Install** — stdio servers using npx have packages pre-installed before SDK starts (v0.21.2)

</details>

---

## Priority 1: Smart Context (highest ROI)

> These make every session dramatically better. Most are VF rules text + shell scripts injected into the container. See `docs/plans/2026-02-16-smart-context-design.md` for full design.
> Origin: Claude inside VaporForge advised a user on optimal setup; the advice became product roadmap.

### Phase 1 — Session Auto-Context `[S]`
> Bash script in container + ~10 lines in claude-agent.js. Files: Dockerfile, ws-agent-server.js, claude-agent.js.

- [ ] **Session Auto-Context** — On session start, run `gather-context.sh` (git status, recent commits, TODOs) and inject output alongside CLAUDE.md. Instant project awareness.
- [ ] **Code Intelligence in Auto-Context** — Extend gather-context.sh with metrics: file counts by type, cached test coverage %, dependency counts (prod/dev).
- [ ] **Proactive Health Checks** — Extend gather-context.sh further: staged console.logs, vulnerable deps, unused deps, large files (>500KB), failing tests from last run, new TODOs. Surface issues before user asks.

### Phase 2 — Knowledge Capture `[FREE]` to `[S]`
> Mostly VF rules text telling Claude to write to knowledge files. Only real code: create `.vaporforge/knowledge/` dir on session start.

- [ ] **Gotchas Capture** `[FREE]` — VF rules instruct Claude to save tricky bugs as gotchas (problem/cause/fix/prevention) to `.vaporforge/knowledge/gotchas.md`. Auto-injected into future sessions.
- [ ] **Decision Log** `[FREE]` — VF rules instruct Claude to save architectural decisions as ADRs to `.vaporforge/knowledge/decisions.md`. Context, options, trade-offs, consequences.
- [ ] **Code Patterns Capture** `[FREE]` — VF rules instruct Claude to save recurring code patterns to `.vaporforge/knowledge/patterns.md`. Auth flow, DB queries, error handling conventions.
- [ ] **Mistake Journal** `[FREE]` — VF rules instruct Claude to track its own errors in `.vaporforge/knowledge/mistakes.md`. What happened, root cause, prevention. Different from gotchas (project bugs) — this tracks Claude's errors specifically.
- [ ] **Intent Prediction** `[FREE]` — VF rules: "If writing component, offer tests. If adding API route, suggest client function + types. If modifying schema, remind about migrations. If fixing bug, suggest regression test."
- [ ] **Quality Pre-flight Checks** `[FREE]` — VF rules: "Before suggesting code, verify: similar code exists (consistency), imports available, matches style, error cases, breaking changes, conventions from patterns.md."
- [ ] **Confidence Levels** `[FREE]` — VF rules: "Express uncertainty explicitly. High (90%+): 'This will work because...'. Medium (60-90%): 'Should work, may need adjustment...'. Low (<60%): 'Best guess, verify by...'"

### Phase 3 — Session Handoff `[M]`
> Needs inactivity detection, new WS message type, KV read/write. Files: ws-agent-server.js, claude-agent.js, sdk.ts, sessions.ts, sandbox.ts.

- [ ] **Session Handoff Summary** — At session end (or timeout), auto-generate summary of what was done, in progress, and next. Stored in KV + container filesystem. Loaded into next session on same repo.
- [ ] **Context Diffing** `[S]` — Snapshot project state at session end; diff against snapshot at next session start. Shows what changed between sessions (commits by others, package changes). Part of gather-context.sh.
- [ ] **Cross-Session Intelligence** `[S]` — Track codebase evolution in `.vaporforge/knowledge/evolution.md`. Weekly summaries from git history + session summaries. Theme, changes, learnings, tech debt created.

### Phase 4 — Behavioral Controls `[S]`
> Settings UI + KV storage + injection into VF rules. Files: CommandCenterTab.tsx, user.ts, sandbox.ts.

- [ ] **Autonomy Presets** — Settings UI for pre-approved vs. requires-approval operations. Three presets: Conservative, Standard, Autonomous. Injected into CLAUDE.md.
- [ ] **Container Hooks (Auto-Enforcement)** — Hookify-style rules: block wrong package managers, warn on console.log before commit, require tests. Instruction-based enforcement via VF rules, upgradeable to native SDK hooks when available.

### Standalone Smart Context Items `[S]` to `[M]`

- [ ] **Code Archaeology Command** `[S]` — Built-in `/archaeology` slash command: first commit context, major changes, last modified, related PRs, recent activity. Shell script wrapper around git log.
- [ ] **Dependency Map Auto-Gen** `[M]` — Scan codebase for import graphs, generate dependency map with circular dependency warnings and "if you modify X, check Y" relationships. Could use madge or custom script.
- [ ] **Knowledge Base Caching** `[M]` — Let users save frequently-referenced docs as local files Claude reads without web fetches. Per-project context7. Settings UI + file storage in container.
- [ ] **Workflow Templates** `[S]` — Pre-built step-by-step templates (add feature, fix bug, add API endpoint). Extends existing commands system with structured checklists.

---

## Priority 2: Core Platform

### MCP Server Management

- [ ] **OAuth Auto-Trigger on Add** `[L]` — Detect 401 + WWW-Authenticate, open browser popup for authorization. Requires: Worker-side MCP OAuth client, browser popup coordination, token exchange, secure storage. Reference: https://docs.warp.dev/agent-platform/capabilities/mcp
- [ ] **Start/Stop + View Logs** `[M]` — Toggle servers on/off with state persistence, view MCP server logs for debugging.
- [ ] **Server Sharing** `[M]` — Share server configs with team members, auto-redact secrets.

### Billing + Business

- [ ] **Stripe Subscription Billing** `[L]` — $20/mo Pro, $80/mo Premium. Stripe Checkout, customer portal, webhook handler. See `docs/business-plan.md`.
- [ ] **Usage Metering** `[M]` — Track sandbox compute hours, API calls, storage per user for billing tiers.
- [ ] **Cost Optimizer** `[M]` — Track token usage and estimated cost per session/daily/monthly. Budget settings with alerts. Tips for reducing cost. Builds on Token Viewer from DevTools.

### DevTools + Polish

- [ ] **TryElements Stream Debugger** `[M]` — Real-time SSE/WS frame inspector showing raw events, timing, and payload sizes.
- [ ] **Token Viewer** `[S]` — Display token usage per message (input/output/cache), running totals per session.
- [ ] **Latency Meter** `[S]` — Time-to-first-token, tokens/sec, and total response time visualized per message.
- [ ] **Plan/Task UI Components** `[M]` — Multi-step agent workflow visualization (task list, dependency graph, progress).
- [ ] **Smart Test Gap Analysis** `[M]` — Identify files with <80% coverage, files with no tests, critical paths below 95%. DevTools panel or built-in command.
- [ ] **Performance Regression Detection** `[S]` — Track build time and bundle size baselines. Alert on regressions. Store in `.vaporforge/perf-baseline.json`.

### Settings Enhancements

- [ ] **Learning Preferences** `[S]` — Settings for explanation style (Just Do It / Balanced / Teach Me), code comment level, progress visibility. Injected into VF rules.
- [ ] **Mentor Mode** `[S]` — Toggle that adds "explain everything in detail" to VF rules. Stored as user preference in KV.

---

## Priority 3: Ambitious UI/UX (research needed)

> These are exciting ideas but each is a significant engineering effort. Some have fundamental blockers (SDK limitations, cost multipliers). Don't start without a design doc.

### Achievable with effort

- [ ] **Quick Actions Palette (Cmd+K)** `[M]` — Command palette for session operations: undo last action, create/rollback checkpoint, export as markdown, view stats. Well-established React pattern (cmdk library).
- [ ] **Live Activity Monitor** `[M]` — Corner widget showing what Claude is doing in real-time. WS stream already sends tool events — this is a rendering layer on top. Files read, modified, tests run, tokens, cost, time.
- [ ] **Annotated Diff View** `[M]` — Claude annotates each change with reasoning. Could use structured output from AI SDK to generate annotations alongside diffs. Accept All / Accept with Edit / Reject buttons.
- [ ] **AI Learning Dashboard** `[M]` — Aggregates from knowledge files (gotchas, decisions, patterns, mistakes) into a visual dashboard. Read markdown files + render. Depends on Phase 2 knowledge capture shipping first.
- [ ] **Git Integration Panel** `[M]` — Visual git status, commit, push, branch management in sidebar.

### Hard — needs design doc + feasibility check

- [ ] **Trust Score System** `[L]` — Trust metric that builds over successful interactions. Higher trust = more autonomy. Needs cross-session state, scoring algorithm, dynamic autonomy adjustment. Complex but not impossible.
- [ ] **Session Recording & Replay** `[L]` — Record WS frames + user inputs (doable). Rebuild UI state from frames for variable-speed playback (hard). Sharing requires a standalone viewer. A product in itself.
- [ ] **Template Gallery** `[M]` — Pre-built sandbox templates (Next.js, Python, Rust) for quick project start.

### Pie in the sky — fundamental blockers

- [ ] **Time-Travel Session View** `[XL]` — Needs git-checkpoint wrapping around every Claude action + timeline replay UI. Container filesystem doesn't persist reliably. Massive undertaking. **Blocker:** No efficient checkpoint mechanism in CF Sandboxes.
- [ ] **Confidence-Based Execution** `[L]` — Claude SDK doesn't expose confidence scores. Self-reported confidence is unreliable. The slider UI is trivial; the underlying signal doesn't exist. **Blocker:** No confidence API from Anthropic.
- [ ] **Parallel Universe Mode** `[XL]` — 3x API cost per question, 3x compute, needs branching sandbox state or git branches per approach. Cool concept, brutal economics. **Blocker:** Cost multiplier + orchestration complexity.
- [ ] **Context Spotlight** `[L]` — Claude SDK doesn't expose which files it reads during reasoning. Tool events show tool calls but not internal file access. **Blocker:** SDK doesn't emit file-read telemetry.
- [ ] **Collaborative Sessions** `[XL]` — Multi-user real-time on one container. WebSocket multiplexing, conflict resolution, shared state. Google Docs-level complexity. **Blocker:** Architecture not designed for multi-user.
