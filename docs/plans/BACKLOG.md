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

## Future Ideas

- [ ] **Collaborative Sessions** — Multiple users in one sandbox session (shared terminal, chat, editor)
- [ ] **Git Integration Panel** — Visual git status, commit, push, branch management in sidebar
- [ ] **Template Gallery** — Pre-built sandbox templates (Next.js, Python, Rust, etc.) for quick project start
