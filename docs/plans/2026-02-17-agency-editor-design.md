# Agency Mode Editor — Design Document

**Date:** 2026-02-17
**Status:** Approved
**Author:** JB + Claude

## Overview

Admin-only visual editor within VaporForge for building and editing agency client sites. Uses the `agency-starter` component library with `data-vf-*` attributes for scoped, click-to-edit AI editing. Hidden from regular VaporForge subscribers — only visible to the admin user.

## Goals

1. Edit client sites visually: click a component, describe changes, see them instantly
2. Zero interference with VaporForge subscribers — invisible to non-admins
3. Leverage existing VaporForge infrastructure (containers, Claude SDK, WebSocket streaming)
4. Auto-save every edit to git — container is ephemeral, git is permanent
5. Staging workflow: edit on a branch, push live when ready

## Architecture

```
VaporForge App (vaporforge.dev)
├── Normal VaporForge (all users)
│   ├── Sessions, Chat, Editor, Terminal
│   └── Settings, Plugins, MCP
│
└── Agency Mode (admin only, hidden from all other users)
    ├── Dashboard: client site grid (KV-backed)
    └── Visual Editor
        ├── Component Tree (collapsible sidebar)
        ├── Iframe Preview (exposePort → astro dev :4321)
        ├── Inspector Overlay (injected script, postMessage)
        └── Edit Panel (component chat + edit history)
```

### Data Flow: Single Component Edit

```
1. Admin clicks component in iframe
2. Inspector script sends postMessage: { component, file, boundingRect }
3. Parent (AgencyEditor) receives, opens Edit Panel
4. Admin types: "Change title to Grand Opening Special"
5. Frontend sends via WebSocket (existing useWebSocket):
   - System prompt scoped to the selected component file
   - Edit instruction as user message
6. Claude SDK in container reads file, edits it, writes modified version
7. Astro HMR fires → iframe refreshes instantly
8. Worker auto-commits to staging branch
9. Edit appears in history panel with undo option
```

### Data Flow: Bulk/Site-Wide Edit

```
1. Admin deselects component (clicks "Site-wide" or empty space)
2. Types: "Change primary color to navy blue"
3. WebSocket message with system prompt scoped to theme.css
4. Claude modifies theme.css → HMR refreshes all components
5. Auto-commit to staging
```

## Access & Auth

- Add `role` field to user record in AUTH_KV (default: `"user"`)
- Admin's account set to `role: "admin"` via one-time manual KV write
- `requireAdmin()` middleware on `/api/agency/*` — returns 404 for non-admins
- Frontend: `isAdmin` in auth store, Agency tab renders only when true
- Non-admins see zero evidence of agency features (no nav, no routes, 404 on API)

## Agency Dashboard

Full-screen overlay (same pattern as SettingsPage).

**Per-site card data:**
- Site name, production URL, thumbnail, last edited date
- Status badge: Live (green) / Staging (amber) / Building (blue)
- Quick actions: Edit / View Live

**KV storage:** `agency-site:{siteId}` → `{ id, name, repoUrl, pagesUrl, domain, lastEdited, thumbnail }`

**Actions:**
- "New Site" → clone agency-starter template to new GitHub repo, create CF Pages project
- "Edit" → spin up container, clone repo (staging branch), start astro dev, open editor
- "View Live" → open production URL

## Visual Editor

Three-panel layout:

```
┌──────────┬────────────────────────────┬──────────┐
│Component │                            │  Edit    │
│Tree      │   iframe (exposePort URL)  │  Panel   │
│(toggle)  │                            │          │
│          │   Real site with           │ Component│
│○ Hero    │   inspector overlay        │ name/file│
│○ Features│                            │          │
│○ Stats   │   Hover: blue outline      │ Chat     │
│○ CTA     │   Click: select            │ input    │
│○ Footer  │                            │          │
│          │                            │ Edit     │
│          │                            │ history  │
└──────────┴────────────────────────────┴──────────┘
```

### Inspector Overlay

- ~50 lines of vanilla JS injected via Astro integration (dev mode only)
- Scans DOM for `[data-vf-component]` elements
- Hover: blue outline around component boundary
- Click: selects component, sends `postMessage` to parent:
  `{ type: 'vf-select', component: 'HeroCentered', file: 'src/components/heroes/HeroCentered.astro' }`
- Parent validates `event.origin` before processing

### Component Tree

- Collapsible left sidebar
- Parsed from iframe DOM via postMessage query on page load
- Click a tree item = same as clicking the component in iframe
- Shows component name + category grouping

### Edit Panel

- Displays selected component name and `data-vf-file` path
- Chat input for edit instructions
- Uses existing WebSocket streaming (useWebSocket hook)
- System prompt scoped: "Edit ONLY {file}. Preserve data-vf-* attributes. Use CSS custom properties only."
- Edit history: scrollable list with undo (git revert)
- "Site-wide" toggle for bulk edits (theme, global content)

### Escape Hatch

- "Open in IDE" button opens full VaporForge session with same repo
- For complex structural changes beyond scoped editing

## Iframe Preview via exposePort

CF Sandbox provides `sandbox.exposePort(port, options)` which creates a public preview URL.

```typescript
const preview = await sandbox.exposePort(4321, { ... });
// preview.url = "https://preview-abc123.sandbox.cloudflare.com"
```

Iframe `src` set to this URL. Same container, two exposed ports:
- Port 8765: WebSocket (ws-agent-server.js) — via wsConnect (existing)
- Port 4321: HTTP (astro dev) — via exposePort (new)

**CRITICAL:** Validate exposePort works as expected before building anything else. This is the #1 implementation task.

## Deployment & Staging

Each client site has:
- A GitHub repo (cloned from agency-starter template)
- A CF Pages project connected to that repo
- Two branches: `main` (production) and `staging` (edits)

**Workflow:**
1. "Edit" → container clones repo → checkout staging (rebase on main first)
2. AI edits auto-commit to staging branch
3. "Push Live" → shows diff summary → merges staging into main
4. CF Pages auto-deploys from main push
5. Dashboard status: Live → Staging → Building → Live

**Auto-commit format:** `agency: Update {ComponentName}: {first 50 chars of instruction}`

## Container Configuration

For agency editing sessions, the container runs:
1. `ws-agent-server.js` on port 8765 (Claude SDK, existing)
2. `astro dev` on port 4321 (site preview, new)

Started via process manager script. Astro dev only starts for agency sessions (not normal VaporForge sessions).

## Post-Edit Validation

After each AI edit, before writing to filesystem:
- Verify `data-vf-component` attribute still present
- Verify `data-vf-file` attribute still present
- Scan for hardcoded color hex codes (reject if found, theme vars only)
- Validate Astro syntax (basic — check for unclosed tags)
- If validation fails: reject edit, show error, don't write file

## Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| exposePort untested | CRITICAL | Validate as task #1 |
| Container startup time | HIGH | Pre-bake node_modules in Docker image |
| Claude breaks components | HIGH | Post-edit validation + git revert |
| Two processes in container | MEDIUM | Process manager, agency-only startup |
| Auto-commit race conditions | MEDIUM | Sequential commit queue (mutex) |
| Staging branch drift | MEDIUM | Rebase on main at edit session start |
| GitHub/CF API tokens | LOW | 1Password + Worker env vars |
| postMessage spoofing | LOW | Origin validation on both sides |
| Admin escalation | LOW | No API exposes role; manual KV only |

## Not Building (Phase 2+)

- Client/developer accounts (Clerk)
- WP Dispatch integration
- Analytics or monitoring dashboards
- Custom domain automation
- Staging preview share links for client approval
- Responsive viewport toggling in editor

## New Code Summary

**Backend (src/):**
- `role` field on user record
- `requireAdmin()` middleware
- `/api/agency/sites` — CRUD
- `/api/agency/sites/:id/edit` — container + astro dev + exposePort
- `/api/agency/sites/:id/commit` — auto-commit to staging
- `/api/agency/sites/:id/push` — merge staging to main
- `/api/agency/sites/create` — clone template, create Pages project

**Frontend (ui/src/):**
- `useAgencyStore` — Zustand store
- `AgencyDashboard.tsx` — site grid
- `AgencyEditor.tsx` — three-panel layout
- `EditPanel.tsx` — component chat + history
- `ComponentTree.tsx` — collapsible tree
- Inspector postMessage listener

**Agency-starter:**
- Astro integration for inspector script injection (dev mode)

**Reused from VaporForge:**
- Container lifecycle (sandboxManager)
- WebSocket streaming (useWebSocket + ws-agent-server.js)
- Claude SDK (claude-agent.js)
- OAuth auth + JWT
