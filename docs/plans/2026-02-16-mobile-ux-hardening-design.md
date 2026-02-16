# VaporForge Mobile UX Hardening — Design Doc

> **Branch:** `refine/mobile-ux-hardening`
> **Preview:** `https://vaporforge-preview.jbmd-creations.workers.dev`
> **Date:** 2026-02-16
> **Goal:** Transform VaporForge mobile from "functional but basic" to "Termius-quality iOS experience", then harden the codebase.

---

## Guiding Principles

1. **"Convert dense strings into simple taps"** — Termius design philosophy
2. **Apple HIG compliance** — 44pt touch targets, native iOS patterns, system gestures
3. **Refine, don't rebuild** — improve existing architecture, don't rewrite from scratch
4. **Test what you touch** — add coverage for every file modified during refinement
5. **Split as you go** — break up oversized files when you're already editing them

---

## Reference Apps

- **Termius** — Gold standard for mobile terminal UX. Extra keys toolbar, command history suggestions, snippets, side panel on iPad, gesture-driven navigation.
- **Apple HIG** — Tab bars, navigation patterns, safe areas, haptics. Accessed via `apple-docs` MCP server.

---

## Phase 1: Mobile Navigation Overhaul (2-3 sessions)

### Problem
Current mobile uses a hamburger drawer for ALL navigation. This requires: tap hamburger > scan list > tap destination > drawer animates closed. That's 3 interactions for every navigation. Hamburger menus are widely considered anti-pattern for primary navigation on mobile.

### Solution: iOS Tab Bar

Replace the hamburger drawer with a persistent bottom tab bar for primary navigation.

**Tabs (when session active):**
| Tab | Icon | View |
|-----|------|------|
| Chat | MessageSquare | Main chat (current default) |
| Files | FolderTree | File tree (currently bottom sheet) |
| Terminal | Terminal | Terminal (currently bottom sheet) |
| More | MoreHorizontal | Settings, plugins, issue tracker, etc. |

**Tabs (no session):**
| Tab | Icon | View |
|-----|------|------|
| Home | Home | Welcome screen / session list |
| More | MoreHorizontal | Settings, plugins, marketplace |

**iPad adaptation:**
- Tab bar on iPhone, sidebar on iPad (detect via screen width >= 768px)
- iPad sidebar shows all navigation items persistently (like Termius side panel)

### Architecture

New files:
- `ui/src/components/mobile/MobileTabBar.tsx` — bottom tab bar
- `ui/src/components/mobile/MobileTabView.tsx` — tab content container with swipe

Modified files:
- `MobileLayout.tsx` — replace hamburger + sheets with tab bar routing
- `MobileDrawer.tsx` — move to "More" tab content or deprecate
- `MobileBottomSheet.tsx` — may keep for secondary overlays (clone modal, etc.)

### Interaction Design

- **Swipe between tabs** — horizontal swipe gesture to move between Chat/Files/Terminal
- **Double-tap tab** — scroll to top of current view
- **Long-press tab** — context menu (e.g., long-press Terminal for "new terminal")
- **Haptic feedback** — on tab switch (light), on long-press (medium)
- **Tab bar hides when keyboard open** — reclaim screen space for typing
- **Safe area respected** — tab bar sits above home indicator

### Session List

Move from drawer to a dedicated view:
- Accessible from Chat tab header (session name is tappable)
- Slides down as a sheet showing all sessions
- Swipe-to-delete on session rows
- Pull-to-refresh for session list

---

## Phase 2: Terminal Touch Experience (2-3 sessions)

### Problem
The terminal is a bottom sheet with a basic xterm.js instance. No extra keys, no command history, no optimizations for touch input. Typing terminal commands on a phone keyboard is painful.

### Solution: Termius-Inspired Terminal

**Extra Keys Toolbar:**
- Persistent toolbar above keyboard when terminal is focused
- Default keys: `Esc`, `Tab`, `Ctrl`, `|`, `/`, `-`, Up, Down, Left, Right
- Customizable: user can add/remove/reorder keys
- Keys stored in localStorage, synced via KV

**Command History Suggestions:**
- As user types, show matching previous commands as tappable pills above the input
- Source: terminal command history from the session
- Tap to insert, long-press to edit before inserting

**Quick Commands / Snippets:**
- Pre-stored commands accessible via toolbar button
- Built-in defaults: `ls -la`, `git status`, `npm test`, `git diff`
- User-editable, stored in KV
- One-tap execution

**Space-Hold Arrow Emulation (stretch):**
- Hold spacebar + drag finger = arrow key movement
- 3 speed gears based on drag distance (Termius pattern)
- Only active when terminal is focused

### Architecture

New files:
- `ui/src/components/mobile/ExtraKeysToolbar.tsx` — extra keys above keyboard
- `ui/src/components/mobile/CommandSuggestions.tsx` — history-based suggestions
- `ui/src/components/mobile/QuickCommands.tsx` — snippet management UI

Modified files:
- `XTerminal.tsx` — integrate extra keys toolbar, hook into terminal focus state
- `useKeyboard.ts` — detect when terminal is focused for toolbar visibility

---

## Phase 3: Chat UX Polish (1-2 sessions)

### Problem
Chat works but lacks iOS polish. No message actions, no smooth scroll anchoring, prompt input is basic.

### Solution

**Message Interactions:**
- Long-press message for action menu: Copy, Retry, Edit prompt, Share
- Haptic feedback on long-press (medium impact)
- Swipe-right on user message to edit

**Prompt Input:**
- Slash commands as tappable pills (show above input when typing `/`)
- Attachment quick-access button (images, files)
- Voice-to-text button (uses native iOS speech recognition)
- Send button animates on press

**Scroll Behavior:**
- Auto-scroll during streaming, but stop if user scrolls up
- "Scroll to bottom" FAB appears when not at bottom
- Pull-to-refresh at top loads older messages

**Streaming Polish:**
- Markdown renders progressively (not flashing between states)
- Code blocks have copy button always visible on mobile
- Thinking/reasoning indicator is more visible

### Architecture

New files:
- `ui/src/components/mobile/MessageActions.tsx` — long-press action menu
- `ui/src/components/mobile/SlashCommandPills.tsx` — command suggestions

Modified files:
- `ChatPanel.tsx` — integrate message actions, scroll behavior
- `PromptInput.tsx` — slash command pills, attachment button
- `useSmoothText.ts` — improve streaming render

---

## Phase 4: Code Quality Hardening (3-4 sessions)

### Problem
45K lines, 5 test files, multiple files over 800+ lines. Fragile to change.

### File Splits Required

| File | Lines | Split Strategy |
|------|-------|---------------|
| `McpTab.tsx` | 1,534 | Split into McpServerList, McpServerForm, McpCredentials, McpToolDiscovery |
| `plugins.ts` | 1,102 | Split into plugin-discovery.ts, plugin-catalog.ts, plugin-github.ts |
| `sandbox.ts` | 1,016 | Split into sandbox-lifecycle.ts, sandbox-injection.ts, sandbox-files.ts |
| `sessions.ts` | 976 | Split into session-crud.ts, session-sandbox.ts |
| `QuickChatPanel.tsx` | 800 | Split into QuickChatMessages, QuickChatInput, QuickChatHistory |
| `WelcomeScreen.tsx` | 691 | Split into WelcomeHero, SessionList, QuickActions |
| `AIProvidersTab.tsx` | 685 | Split into ProviderCard, ProviderForm, ProviderList |
| `PluginsTab.tsx` | 651 | Split into PluginList, PluginCard, PluginToggle |
| `sdk.ts` | 611 | Split into ws-proxy.ts, sdk-persist.ts |
| `CloneRepoModal.tsx` | 584 | Split into RepoUrlInput, CloneProgress, RepoTemplates |

### Test Coverage Targets

**Critical paths (must have):**
- Auth flow (login, token refresh, JWT validation) — partially covered
- WebSocket streaming (message send, receive, error handling)
- Session lifecycle (create, resume, delete)
- MCP config assembly
- Container injection (agents, secrets, credentials)

**Important paths (should have):**
- Quick chat streaming
- File upload/download
- Plugin discovery
- Settings CRUD

**Target:** 60% backend coverage, 40% frontend coverage (realistic for this pass)

### Error Handling Audit

- Audit all API endpoints for consistent error responses
- Add proper error boundaries in React components
- Ensure no sensitive data in error messages
- Add retry logic for transient failures (WS disconnect, container wake)

### Security Review

- Input validation on all API endpoints (Zod schemas)
- CSRF protection verification
- Rate limiting on auth endpoints
- JWT expiry and refresh handling

---

## Deploy Strategy

- All work on `refine/mobile-ux-hardening` branch
- Deploy to preview: `npm run build && npx wrangler deploy --env preview`
- Test on iPhone/iPad at preview URL
- Container changes (if any) deploy to main since preview shares production DOs
- Merge to main when each phase is approved

---

## Success Criteria

1. Mobile navigation takes 1 tap (tab bar) instead of 3 (hamburger > item > close)
2. Terminal has extra keys toolbar and command history on mobile
3. All files under 400 lines (800 max exceptions with justification)
4. 60%+ backend test coverage, 40%+ frontend test coverage
5. No known iOS keyboard/viewport bugs
6. Passes Apple HIG review for touch targets, safe areas, and navigation patterns
