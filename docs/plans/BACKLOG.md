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

## Future Ideas

- [ ] **Collaborative Sessions** — Multiple users in one sandbox session (shared terminal, chat, editor)
- [ ] **Git Integration Panel** — Visual git status, commit, push, branch management in sidebar
- [ ] **Template Gallery** — Pre-built sandbox templates (Next.js, Python, Rust, etc.) for quick project start
