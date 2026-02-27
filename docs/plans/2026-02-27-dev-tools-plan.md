# Dev Tools Overlay & Universal Issue Tracker

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-02-27
**Status:** Planned

**Goal:** Full-screen dev overlay with four tabs (Canvas, Component Browser, Console, Issues) backed by universal KV-synced issue tracker so changes appear across all open tabs/sessions.

**Architecture:** Full-screen overlay (same z-50 fixed pattern as SettingsPage/IssueTracker), KV + Zustand + visibility-based polling for sync, static shadcn catalog generated at build time (same pattern as `generate-plugin-catalog.mjs`).

**Tech Stack:** React 18, Tailwind v3.4, Hono (Worker), Cloudflare KV, Zustand, Zod

---

## Phase 1: Universal Issue Tracker Sync

**Goal**: Single source of truth — edit issues in any tab/session, changes propagate everywhere.

### How it works today
- `useIssueTracker.ts` stores issues in Zustand + localStorage (`vf-issue-tracker`)
- Debounced sync to `PUT /api/issues` → KV key `issues:${userId}`
- Per-user scoping via `userId` derived from Claude token hash

### What changes

**Backend:**
- Add `GET /api/issues/sync` returning `{ issues, lastModified }` with ETag support
- Add `updatedAt` timestamp to the issue store, returned on every write
- Add `PATCH /api/issues/:id` for single-issue updates (avoids full-list overwrites)

**Frontend:**
- Add visibility-based polling (every 30s visible, paused when hidden)
- Compare `lastModified` — server wins for conflicts (last-write-wins with timestamp)
- localStorage becomes offline cache only; KV is source of truth

### Files
| File | Change |
|------|--------|
| `src/api/issues.ts` | Add `getWithEtag()`, `patchIssue()` methods |
| `src/api/issues-routes.ts` | Add `GET /sync`, `PATCH /:id` routes |
| `ui/src/hooks/useIssueTracker.ts` | Add polling sync, visibility-based refresh |
| `src/types.ts` | Add `updatedAt` to `IssueTrackerData` schema |

---

## Phase 2: Dev Tools Overlay

**Goal**: Dedicated full-screen overlay for visually building/tweaking UI components.

### Entry Points
- Settings → Developer → "Open Dev Tools" button
- Keyboard shortcut (Cmd+Shift+D)

### UI Layout

```
┌─────────────────────────────────────────────┐
│  DEV TOOLS                             [X]  │
│  ┌──────┬───────────┬────────┬─────────┐    │
│  │Canvas│ Components│ Console│ Issues  │    │
│  └──────┴───────────┴────────┴─────────┘    │
│                                             │
│  [Tab content area]                         │
│                                             │
└─────────────────────────────────────────────┘
```

**Tab 1: Canvas** — Live preview with props editor (JSON/form-based), resizable viewport presets (mobile/tablet/desktop)

**Tab 2: Component Browser** — shadcn/ui catalog (static, copy-paste only, no runtime dep)
- Each entry: preview snippet, copy-paste code, Tailwind class variants
- Search + filter by category (Form, Layout, Data Display, Feedback, Navigation)

**Tab 3: Console** — Upgraded debug logger that absorbs the floating DebugPanel
- Reuses `useDebugLog.ts`, adds filter by level, text search, JSON export
- Persists last 500 entries in localStorage

**Tab 4: Issues** — Embedded IssueTracker (same Zustand store, different mount, benefits from Phase 1 sync)

### Data Model

```typescript
interface DevPanel {
  id: string;
  name: string;
  code: string;
  props: Record<string, unknown>;
  tailwindClasses: string;
  createdAt: string;
  updatedAt: string;
}

interface DevToolsState {
  panels: DevPanel[];
  activePanel: string | null;
  viewport: 'mobile' | 'tablet' | 'desktop';
  isOpen: boolean;
}
```

**Storage:** `devtools:${userId}` in AUTH_KV — syncs universally via same polling pattern as Phase 1.

### shadcn Component Catalog
- Generated at build time by `scripts/generate-component-catalog.mjs`
- Outputs static TypeScript catalog at `ui/src/lib/generated/component-catalog.ts`
- Same approach as `scripts/generate-plugin-catalog.mjs`
- No runtime shadcn dependency

### Files
| File | Purpose |
|------|---------|
| `ui/src/components/DevTools.tsx` | NEW — Main overlay (tabs, layout) |
| `ui/src/components/devtools/CanvasTab.tsx` | NEW — Live preview + props editor |
| `ui/src/components/devtools/ComponentsTab.tsx` | NEW — shadcn catalog browser |
| `ui/src/components/devtools/ConsoleTab.tsx` | NEW — Debug/console (absorbs DebugPanel) |
| `ui/src/hooks/useDevTools.ts` | NEW — Zustand store |
| `ui/src/lib/generated/component-catalog.ts` | NEW — Static shadcn catalog |
| `scripts/generate-component-catalog.mjs` | NEW — Build script for catalog |
| `src/api/devtools.ts` | NEW — KV persistence service |
| `src/api/devtools-routes.ts` | NEW — API routes (GET/PUT) |
| `ui/src/components/Layout.tsx` | Mount `<DevTools />` |
| `ui/src/components/settings/DevToolsTab.tsx` | Add "Open Dev Tools" button |

---

## Phase 3: Console Logger Unification

**Goal**: Shared `<ConsoleLogViewer />` between the overlay Console tab and the floating mini-panel.

| File | Change |
|------|--------|
| `ui/src/components/DebugPanel.tsx` | Extract `<ConsoleLogViewer />`, keep floating mini-panel wrapper |
| `ui/src/components/devtools/ConsoleTab.tsx` | Use `<ConsoleLogViewer />` full-size |
| `ui/src/hooks/useDebugLog.ts` | Add log levels, localStorage persistence, 500-entry cap |

---

## Implementation Order

1. **Phase 1** (~3 commits) — sync + patch endpoints, polling in useIssueTracker
2. **Phase 2** (~6 commits) — Zustand store + API routes, overlay shell + tabs, catalog build script, canvas tab, wire entry points
3. **Phase 3** (~2 commits) — extract ConsoleLogViewer, integrate into Console tab

## Constraints
- Does NOT restructure the monorepo (no npm workspaces)
- Does NOT install shadcn/ui as a runtime dependency (static catalog only)
- Does NOT require Workers config changes (existing KV namespaces)
- Does NOT add WebSocket sync (polling sufficient)
