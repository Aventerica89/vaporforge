# VaporForge — Plan Index

Master index of all feature plans. This file tracks status only — full details live in `docs/plans/`.

## Conventions

| Rule | Detail |
|------|--------|
| New plan | Create `docs/plans/YYYY-MM-DD-{feature}-plan.md` |
| New design | Create `docs/plans/YYYY-MM-DD-{feature}-design.md` (no task list) |
| Status change | Update the table in this file only — do not edit the plan file |
| New feature ideas | Add to `docs/plans/BACKLOG.md` first |
| Architecture docs | Add to `docs/` without date prefix |

---

## Active

| Plan | Date | Description |
|------|------|-------------|
| [V1.5 DO Stability](docs/plans/2026-02-25-v15-stability-hardening-plan.md) | 2026-02-25 | Migrate chat to ChatSessionAgent DO: HTTP streaming, crash recovery, DO sentinel keepalive, reconnect replay |

**Supporting research:**
- `~/.claude/plans/2026-02-25-vaporforge-v15-research-synthesis.md` — multi-model research synthesis (Gemini/MiniMax/DeepSeek, 11 responses)

---

## Planned

| Plan | Date | Description |
|------|------|-------------|
| [Dev Tools Overlay + Issue Sync](docs/plans/2026-02-27-dev-tools-plan.md) | 2026-02-27 | Full-screen dev overlay (canvas, shadcn browser, console, issues) + KV-backed universal issue sync |
| [Apple HIG Polish](docs/plans/2026-02-17-apple-hig-polish-design.md) | 2026-02-17 | Design doc — bring all interactive elements to full HIG compliance. Needs implementation plan. |
| [Smart Context System](docs/plans/2026-02-16-smart-context-design.md) | 2026-02-16 | Auto-inject git state, gotchas, decisions into every session. Design doc only — needs implementation plan. |
| [GitHub App Integration](docs/plans/github-app-integration.md) | ongoing | OAuth-free repo access via GitHub App; seamless clone without user token management |

---

## Shipped

| Plan | Shipped | Version |
|------|---------|---------|
| [Agency Code Mode](docs/plans/2026-02-19-agency-code-mode-plan.md) | 2026-02-19 | v0.27.0 |
| [Agency Editor v2](docs/plans/2026-02-18-agency-editor-v2-plan.md) | 2026-02-18 | v0.26.0 |
| [Agency Mode Phase 1 — Component Library](docs/plans/2026-02-17-agency-mode-phase1-plan.md) | 2026-02-17 | v0.25.0 |
| [Agency Editor](docs/plans/2026-02-17-agency-editor-plan.md) | 2026-02-17 | v0.25.0 |
| [Agency Mode Foundation](docs/plans/2026-02-17-agency-mode-plan.md) | 2026-02-17 | v0.25.0 |
| [Streaming Latency Optimization](docs/plans/2026-02-17-streaming-latency-plan.md) | 2026-02-17 | v0.20.0 |
| [Mobile UX Hardening](docs/plans/2026-02-16-mobile-ux-hardening-plan.md) | 2026-02-16 | v0.21.0 |
| [Mobile Layout Redesign](docs/plans/2026-02-16-mobile-layout-redesign-plan.md) | 2026-02-16 | v0.21.0 |
| [MCP Server Management](docs/plans/2026-02-15-mcp-server-update-plan.md) | 2026-02-15 | v0.21.0 |
| [WebSocket Streaming](docs/plans/2026-02-15-websocket-streaming-plan.md) | 2026-02-15 | v0.20.0 |

---

## Reference

| Doc | Description |
|-----|-------------|
| [Feature Backlog](docs/plans/BACKLOG.md) | Prioritized list of future features with effort estimates |
| [Platform Architecture](docs/PLAN.md) | Original Cloudflare Workers + Sandboxes architecture reference |
