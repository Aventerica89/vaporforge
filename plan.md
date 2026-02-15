# Plan: Dev Playground & Universal Issue Tracker

## Problem Statement

Three related needs:
1. **Dev Playground** — A dedicated workspace for building/tweaking UI component panels interactively, with access to a shadcn component catalog to build from
2. **Universal Issue Tracker** — The current issue tracker (`issues:${userId}` in KV) is scoped to a single tab. Need it to sync across all open tabs/sessions so editing on one updates everywhere
3. **Bug/Debug/Console Logger** — Consolidate the existing DebugPanel into the dev tools experience

## Architecture Decision: NOT a monorepo restructure

The project is already a functional monorepo (`src/` backend, `ui/` frontend, `landing/`). Adding npm workspaces would be over-engineering. We build on existing patterns:

- **Full-screen overlay** for the playground UI (same pattern as SettingsPage/IssueTracker — z-50 fixed overlay)
- **KV + Zustand + polling** for universal sync (same pattern as issue tracker, add sync layer)
- **Static component catalog** at build time (same pattern as `generate-plugin-catalog.mjs`)

---

## Phase 1: Universal Issue Tracker Sync

**Goal**: Single source of truth — edit issues in any tab/session, changes appear everywhere.

### How it works today
- `useIssueTracker.ts` stores issues in Zustand + localStorage (`vf-issue-tracker`)
- Debounced sync to `PUT /api/issues` → KV key `issues:${userId}`
- Per-user scoping via `userId` derived from Claude token hash

### What changes

**Backend (`src/api/issues.ts` + `src/api/issues-routes.ts`)**:
- Add `GET /api/issues/sync` endpoint returning `{ issues, lastModified }` with ETag support
- Add `updatedAt` timestamp to the issue store data, returned on every write
- Add `PATCH /api/issues/:id` for single-issue updates (avoids full-list overwrites)

**Frontend (`ui/src/hooks/useIssueTracker.ts`)**:
- Add visibility-based polling sync (every 30s when tab is visible, pause when hidden)
- Compare `lastModified` — server wins for conflicts (last-write-wins with timestamp)
- localStorage becomes offline cache only, KV backend is source of truth

**Why this already "works across sites"**: All VaporForge sessions share the same KV namespace and the same `userId`. Issues are already universal — the missing piece is just real-time sync (polling) so changes in one tab reflect in another without reload.

### Files to modify
| File | Change |
|------|--------|
| `src/api/issues.ts` | Add `getWithEtag()`, `patchIssue()` methods |
| `src/api/issues-routes.ts` | Add `GET /sync`, `PATCH /:id` routes |
| `ui/src/hooks/useIssueTracker.ts` | Add polling sync, visibility-based refresh |
| `src/types.ts` | Add `updatedAt` to `IssueTrackerData` schema |

---

## Phase 2: Dev Playground

**Goal**: Dedicated page for visually building/tweaking UI components. Browse shadcn components, drop them in, adjust live.

### UI Structure

Accessible from:
- Settings → Developer → "Open Playground" button
- Mobile drawer footer (alongside Home, Bug Tracker)
- Keyboard shortcut (Cmd+Shift+D)

Opens as a **full-screen overlay** with its own tab system:

```
┌─────────────────────────────────────────────┐
│  DEV PLAYGROUND                        [X]  │
│  ┌──────┬───────────┬────────┬─────────┐    │
│  │Canvas│ Components│ Console│ Issues  │    │
│  └──────┴───────────┴────────┴─────────┘    │
│                                             │
│  [Tab content area]                         │
│                                             │
└─────────────────────────────────────────────┘
```

**Tab 1: Canvas** — Live preview panel
- Renders user-created component panels in a sandboxed div
- Hot-reloads on code changes
- Resizable viewport presets (mobile/tablet/desktop)
- Props editor sidebar (JSON or form-based)

**Tab 2: Components** — shadcn/ui catalog browser
- Static catalog of shadcn components (Button, Card, Dialog, Input, Select, Table, etc.)
- Each entry: preview snippet, copy-paste code, Tailwind class variants
- Click to insert into active canvas panel
- Search + filter by category (Form, Layout, Data Display, Feedback, Navigation)
- **Not installed as a dependency** — catalog is reference/copy-paste only

**Tab 3: Console** — Upgraded debug/console logger
- Merges existing `DebugPanel` functionality into this tab
- Categorized logs: API, Stream, Sandbox, Error, Info (reuses `useDebugLog.ts`)
- Filter by level, search by text, export as JSON
- Persists last 500 entries in localStorage

**Tab 4: Issues** — Embedded issue tracker
- Renders the existing `IssueTracker` component inline (not as a separate modal)
- Same Zustand store, same sync — just a different mount point
- Benefits from Phase 1 universal sync

### Data Model

```typescript
interface PlaygroundPanel {
  id: string;
  name: string;
  code: string;           // TSX/JSX source
  props: Record<string, unknown>;
  tailwindClasses: string;
  createdAt: string;
  updatedAt: string;
}

interface PlaygroundState {
  panels: PlaygroundPanel[];
  activePanel: string | null;
  viewport: 'mobile' | 'tablet' | 'desktop';
  isOpen: boolean;
}
```

**Storage**: `playground:${userId}` in AUTH_KV. Syncs universally via same polling pattern from Phase 1.

### shadcn Component Catalog

Generated at build time (same approach as `scripts/generate-plugin-catalog.mjs`):
- Script reads shadcn component registry and outputs a static TypeScript catalog
- Each entry: name, category, code snippet, dependencies, Tailwind classes
- Browseable in the Components tab — "Use" copies code into active panel
- No runtime shadcn dependency

### Files to create/modify
| File | Purpose |
|------|---------|
| `ui/src/components/DevPlayground.tsx` | **NEW** — Main overlay (tabs, layout) |
| `ui/src/components/playground/CanvasTab.tsx` | **NEW** — Live preview + props editor |
| `ui/src/components/playground/ComponentsTab.tsx` | **NEW** — shadcn catalog browser |
| `ui/src/components/playground/ConsoleTab.tsx` | **NEW** — Debug/console (absorbs DebugPanel) |
| `ui/src/hooks/usePlayground.ts` | **NEW** — Zustand store |
| `ui/src/lib/generated/component-catalog.ts` | **NEW** — Static shadcn catalog |
| `scripts/generate-component-catalog.mjs` | **NEW** — Build script for catalog |
| `src/api/playground.ts` | **NEW** — KV persistence service |
| `src/api/playground-routes.ts` | **NEW** — API routes (GET/PUT) |
| `ui/src/components/MobileDrawer.tsx` | Add "Dev Playground" button |
| `ui/src/components/Layout.tsx` | Mount `<DevPlayground />` |
| `ui/src/components/settings/DevToolsTab.tsx` | Add "Open Playground" button |

---

## Phase 3: Console Logger Integration

**Goal**: Unify the debug experience.

### Changes
- Extract log display from `DebugPanel.tsx` into reusable `<ConsoleLogViewer />` component
- Use `ConsoleLogViewer` in both: playground Console tab AND floating mini-panel
- Add log levels: `debug`, `info`, `warn`, `error` (currently category-based only)
- Persist last 500 entries in localStorage (currently in-memory only)
- Floating mini-panel (existing DebugPanel) stays as a quick-access shortcut

### Files to modify
| File | Change |
|------|--------|
| `ui/src/components/DebugPanel.tsx` | Extract `<ConsoleLogViewer />`, keep floating mini-panel |
| `ui/src/components/playground/ConsoleTab.tsx` | Use `<ConsoleLogViewer />` full-size |
| `ui/src/hooks/useDebugLog.ts` | Add log levels, localStorage persistence, 500-entry cap |

---

## Implementation Order

1. **Phase 1** (Universal Issue Sync) — ~3 commits
   - Backend: sync endpoint + patch endpoint + updatedAt tracking
   - Frontend: polling sync in useIssueTracker
   - Test the sync across multiple tabs

2. **Phase 2** (Dev Playground) — ~6 commits
   - Zustand store + API routes for playground persistence
   - Main overlay shell with tab system
   - Component catalog build script + browser UI
   - Canvas tab with live preview
   - Wire up entry points (Settings, MobileDrawer, keyboard shortcut)
   - Embed issue tracker as tab

3. **Phase 3** (Console Logger) — ~2 commits
   - Extract ConsoleLogViewer from DebugPanel
   - Integrate into playground Console tab + add log levels/persistence

## What this does NOT do
- Does NOT restructure the monorepo (npm workspaces, etc.)
- Does NOT install shadcn/ui as a runtime dependency (catalog is static reference only)
- Does NOT require Cloudflare Workers config changes (uses existing KV namespaces)
- Does NOT add WebSocket sync (polling is sufficient; WS can come later if needed)
- Does NOT inject code into other projects — VaporForge itself is the shared layer, data syncs via KV
