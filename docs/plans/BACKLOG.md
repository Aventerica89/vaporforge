# VaporForge Feature Backlog

> Persistent record of planned features. Check items off as they ship.

---

## MCP Server Management

- [ ] **OAuth Auto-Trigger on Add** — When adding an OAuth MCP server, detect the 401 + WWW-Authenticate response, extract the authorization URL, open a browser popup for the user to authorize immediately (like Warp does). Requires: Worker-side MCP OAuth client, browser popup coordination, token exchange, secure token storage in KV. Reference: https://docs.warp.dev/agent-platform/capabilities/mcp
- [x] **Paste JSON Config to Add** — Parse mcpServers JSON blobs from docs/Claude Code/Warp (Phase 1, v0.21.0)
- [x] **Custom Headers** — Key-value pairs for HTTP server auth tokens (Phase 1, v0.21.0)
- [x] **Env Vars per Server** — Key-value pairs for stdio server credentials (Phase 1, v0.21.0)
- [x] **Expandable Tool List** — Show available tools as pill badges per server (Phase 1, v0.21.0)
- [x] **Credential File Upload** — Upload service account JSON, PEM keys, etc. per server. Injected to container filesystem. (v0.21.1)
- [x] **Multi-File Credentials** — Multiple credential files per server with path auto-injection into CLAUDE.md (v0.21.2)
- [x] **Fresh Config per Message** — MCP config recomputed on every message, not cached from session creation (v0.21.2)
- [x] **npx Pre-Install** — stdio servers using npx have packages pre-installed before SDK starts (v0.21.2)
- [ ] **Start/Stop + View Logs** — Toggle servers on/off with state persistence, view MCP server logs for debugging (from Warp)
- [ ] **Server Sharing** — Share server configs with team members, auto-redact secrets (from Warp)

## Batch 5: DevTools + Polish

- [ ] **TryElements Stream Debugger** — Real-time SSE/WS frame inspector showing raw events, timing, and payload sizes
- [ ] **Token Viewer** — Display token usage per message (input/output/cache), running totals per session
- [ ] **Latency Meter** — Time-to-first-token, tokens/sec, and total response time visualized per message
- [ ] **Plan/Task UI Components** — Multi-step agent workflow visualization (task list, dependency graph, progress)
- [ ] **Smart Test Gap Analysis** — Identify files with <80% coverage, files with no tests at all, and critical paths (auth, payment, API) below 95%. Built-in command or DevTools panel.
- [ ] **Performance Regression Detection** — Track build time and bundle size baselines per session. Alert when build time increases >1s or bundle grows significantly. Store baselines in `.vaporforge/perf-baseline.json`.

## Billing + Business

- [ ] **Stripe Subscription Billing** — $20/mo Pro, $80/mo Premium. Stripe Checkout, customer portal, webhook handler. See `docs/business-plan.md` for full cost/competitive analysis.
- [ ] **Usage Metering** — Track sandbox compute hours, API calls, storage per user for billing tiers

## Smart Context (from Claude-in-VaporForge feedback)

> Origin: A user asked Claude inside VaporForge how to optimize their setup. Claude's advice became a product roadmap. See `docs/plans/2026-02-16-smart-context-design.md` for full design.

- [ ] **Session Auto-Context** — On session start, auto-run a context script (git status, recent commits, TODOs, running processes) and inject the output alongside CLAUDE.md. Gives Claude instant project awareness without the user having to explain anything.
- [ ] **Gotchas Capture** — When a user resolves a tricky bug or debugging session in chat, offer to save it as a gotcha (problem/cause/fix/prevention) to a persistent knowledge file. Auto-injected into future sessions so Claude never hits the same issue twice.
- [ ] **Decision Log** — When architectural decisions are made in chat (framework choice, pattern selection, trade-offs), offer to capture them as an ADR (Architecture Decision Record) saved per-project. Claude references these to stay consistent.
- [ ] **Dependency Map Auto-Gen** — On session start or on-demand, scan the codebase for import graphs and generate a dependency map showing critical paths, circular dependency warnings, and "if you modify X, also check Y" relationships.
- [ ] **Session Handoff Summary** — At session end (or before container timeout), auto-generate a summary of what was accomplished, what's in progress, and what's next. Stored in KV and loaded into the next session's context.
- [ ] **Knowledge Base Caching** — Let users save frequently-referenced docs (API specs, framework patterns, internal conventions) as local knowledge files that Claude can read without web fetches. Like a per-project context7.
- [ ] **Workflow Templates** — Pre-built step-by-step templates for common tasks (add feature, fix bug, add API endpoint, set up auth) that Claude follows automatically. Extends the existing commands system with structured checklists.
- [ ] **Code Patterns Capture** — Alongside gotchas and decisions, capture recurring code patterns (auth flow, DB queries, error handling conventions) to a persistent `patterns.md` file. Auto-injected into future sessions so Claude follows established conventions.
- [ ] **Autonomy Presets** — Settings UI for configuring what Claude can do without asking (read files, run tests, commit) vs. what requires approval (push, delete, modify config). Three built-in presets: Conservative, Standard, Autonomous.
- [ ] **Container Hooks (Auto-Enforcement)** — Hookify-style rules inside the sandbox: block wrong package managers, warn on console.log before commit, require tests for changes. Instruction-based enforcement via VF rules, upgradeable to native SDK hooks when available.
- [ ] **Code Intelligence in Auto-Context** — Enhance the auto-context script with code metrics: file counts by type, cached test coverage percentage, dependency counts (prod/dev). Gives Claude instant codebase scale awareness.
- [ ] **Mistake Journal** — Track what Claude gets wrong and WHY in `.vaporforge/knowledge/mistakes.md`. Format: what happened, root cause, prevention, pattern learned. Auto-prompt at session end to review corrections/rejections. Different from gotchas (project bugs) — this tracks Claude's own errors to improve across sessions.
- [ ] **Proactive Health Checks** — Extend auto-context with a health check script: staged console.logs, vulnerable dependencies (`bun audit`), unused dependencies (`depcheck`), large files (>500KB), failing tests from last run, new TODOs in recent changes. Surface issues before user asks.
- [ ] **Context Diffing** — Auto-snapshot project state at session end; diff against snapshot at next session start. Shows what changed between sessions (new commits by others, package changes, file modifications). Gives Claude awareness of external changes.
- [ ] **Intent Prediction** — VF rules that teach Claude to anticipate next steps: writing component → offer tests + story; adding API route → suggest client function + types; modifying schema → remind about migrations; fixing bug → suggest regression test. "If (current action) then predict (next step) and offer."
- [ ] **Code Archaeology Command** — Built-in `/archaeology` command that shows WHY code exists: first commit context, major changes (top 5), last modified, related PRs, recent activity. Run before modifying unfamiliar code to understand intent.
- [ ] **Quality Pre-flight Checks** — Before suggesting code changes, Claude auto-verifies: similar code exists (consistency), imports available, matches existing style, error cases considered, breaking changes assessed, conventions from patterns.md respected. VF rules enhancement.
- [ ] **Confidence Levels** — VF rules requiring Claude to express uncertainty explicitly. High (90%+): "This will work because...". Medium (60-90%): "Should work, may need adjustment...". Low (<60%): "Best guess, verify by...". Never pretend certainty when guessing.
- [ ] **Cross-Session Intelligence** — Track codebase evolution in `.vaporforge/knowledge/evolution.md`. Weekly summaries: theme (e.g., "auth overhaul"), changes made, learnings, tech debt created. Auto-generated from git history + session summaries. Gives Claude project trajectory awareness.

## UI/UX Innovations (from Claude Advice 2)

> Origin: Second round of Claude-inside-VaporForge feedback. Focus on visual interface innovations and workflow enhancements.

- [ ] **Time-Travel Session View** — Timeline scrubber showing session history with auto-checkpoints before risky operations. One-click rollback to any point. Visual markers for milestones. Export section as "how I built this" tutorial. The killer feature no one else has.
- [ ] **Confidence-Based Execution** — Show Claude's confidence percentage per suggestion. User sets auto-apply threshold (e.g., 80%). Above threshold: auto-applied. Below: requires approval. Settings slider for threshold + per-operation overrides. Trust through transparency.
- [ ] **Parallel Universe Mode** — AI explores 2-3 approaches simultaneously for a given task. Side-by-side comparison with confidence scores, trade-offs, and code preview per approach. User selects which to apply. "See tradeoffs before committing."
- [ ] **Context Spotlight** — Visual heatmap overlay on file tree showing what Claude is currently reading/thinking about. Live status: "Reading Button.tsx (line 45-67), Reason: Understanding pattern before creating Form." Always know what Claude is doing and why.
- [ ] **Annotated Diff View** — Diff view where Claude annotates each change with reasoning: "Added null check (security)", "Added expiry validation (from auth-best-practices.md)". Shows confidence and risk level per change. Accept All / Accept with Edit / Reject buttons.
- [ ] **Quick Actions Palette (Cmd+K)** — Command palette for session operations: rollback to checkpoint, undo last Claude action, create checkpoint, replay session from point, export as markdown, show context spotlight, view session stats, clear and start fresh.
- [ ] **Live Activity Monitor** — Always-visible corner widget showing what Claude is doing in real-time. Expandable view with: files read, files modified, tests run, tokens used, estimated cost, session time. Replace mystery with transparency.
- [ ] **Session Recording & Replay** — Record entire sessions with playback at variable speed (0.5x-5x). Share with teammates. Export as documentation. Bookmark key moments. Use cases: review while away, share "how I solved X", create tutorials, audit trail.
- [ ] **AI Learning Dashboard** — Shows what Claude has learned about YOUR codebase: detected patterns (commit format, import style, auth patterns), conventions learned (package manager, aliases, error handling), your preferences (autonomy, explanation style, risk), common mistakes it's learned to avoid. Reset/export controls.
- [ ] **Trust Score System** — Real-time trust metric that builds over successful interactions. Score goes up with: successful changes, proactive bug catches, passing tests. Score goes down with: failed operations, broken tests. Higher trust = more autonomy. Visible in UI.

## Settings Enhancements

- [ ] **Learning Preferences** — Settings for how Claude communicates: explanation style (Just Do It / Balanced / Teach Me), code comment level (None / When Complex / Comprehensive), show progress (live updates, tool visibility, token meter, time estimates).
- [ ] **Mentor Mode** — Toggle that makes Claude explain everything it does in detail. Useful for learning. Shows what middleware is, why JWT works this way, etc. Continue / Ask Question / Skip buttons per explanation block. Stored as user preference.
- [ ] **Cost Optimizer** — Track token usage and estimated cost per session, daily, and monthly. Show expensive operations. Daily/monthly budget settings with alerts. Tips for reducing cost (targeted searches vs full codebase scans). Helps users understand and control API spending.

## Future Ideas

- [ ] **Collaborative Sessions** — Multiple users in one sandbox session (shared terminal, chat, editor)
- [ ] **Git Integration Panel** — Visual git status, commit, push, branch management in sidebar
- [ ] **Template Gallery** — Pre-built sandbox templates (Next.js, Python, Rust, etc.) for quick project start
