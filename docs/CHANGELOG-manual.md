# Changelog

All notable changes to VaporForge are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.23.0] - 2026-02-16

### Added
- Apple HIG mobile layout redesign: iPhone uses bottom tab bar (49pt + safe area), iPad uses 280px sidebar
- MobileNavBar component: 44pt translucent blur nav bar with back/title/actions
- MobileTabBar upgrade: 25pt SF Symbol-style icons, system colors, blur background
- Sub-navigation system: Settings and Marketplace render inline within mobile layouts via `useMobileNav` hook
- TabletLayout component: iPad sidebar with logo, session nav, tools, sessions list
- Swipe gesture navigation between tabs on iPhone
- MoreMenu refactored to use `onNavigate` callback instead of direct store toggles

### Changed
- Layout.tsx splits routing by `layoutTier` (tablet/phone/desktop) instead of boolean `isMobile`
- Desktop panel defaults simplified (tablet/phone handled by their own layouts)

## [0.22.0] - 2026-02-16

### Added
- Smart Context Phase 1: Session Auto-Context
- `gather-context.sh`: fault-tolerant bash script (2KB cap, 10s timeout) gathers git status, TODOs, code metrics, previous session context
- Auto-context cached at container startup via `ws-agent-server.js`
- `buildSystemPromptAppend()` reads cached context and appends to system prompt
- Auto-context toggle in Command Center settings (optimistic UI update)
- `.vaporforge/knowledge/` directory created in container for Phase 2 prep

## [0.21.2] - 2026-02-15

### Added
- Multi-file credential support per MCP server (uploaded + injected to container filesystem)
- Diagnostic transport-type logging for MCP injection

### Fixed
- Fresh MCP config computed on every message (fixes stale session-mcp KV key)
- npx package pre-install for stdio servers (fixes silent SDK server drops)
- Gemini config merge bug resolved

## [0.21.0] - 2026-02-15

### Added
- MCP server management upgrade (Phase 1)
- Paste JSON config with auto-detection (Claude Code, Warp, raw formats)
- Custom HTTP headers for auth + env vars for stdio servers
- Tool discovery: ping servers for available tools displayed as pill badges
- Credential file upload and injection per server
- Edit existing servers (PUT endpoint)
- Multi-server batch add from pasted JSON

## [0.20.0] - 2026-02-15

### Added
- WebSocket streaming for main chat (replaces broken SSE)
- `ws-agent-server.js` in container on port 8765, spawns `claude-agent.js` per query
- Worker proxies WebSocket via `sandbox.wsConnect(request, 8765)`
- Context file pattern: Worker writes config to `/tmp/vf-pending-query.json`, container reads and deletes
- `POST /api/sdk/persist` endpoint for browser to save full text after stream completes
- WS auth via `?token=JWT` query param

### Fixed
- Real-time streaming now works in production (CF Sandbox `execStream()` SSE buffering bypassed entirely)

## [0.19.0] - 2026-02-15

### Added
- `emit()` helper using `fs.writeSync(1, ...)` to bypass Node block-buffered stdout
- `useSmoothText` hook: typewriter buffer via requestAnimationFrame with adaptive speed
- `SmoothTextPart` component: streaming text smoothed, completed text renders instantly

### Fixed
- Prompt input CSS polish: muted background, hover state, focus glow, backdrop blur

## [0.16.0] - 2026-02-14

### Added
- DevTools batch: DevChangelog (in-app commit log viewer), DevPlayground (component sandbox)
- Layout customization in Settings with live panel size display and reset

## [0.15.0] - 2026-02-14

### Added
- Tool-calling agent for Quick Chat with 4 sandbox tools: readFile, listFiles, searchCode, runCommand
- AI SDK v6 `tool()` definitions with `stepCountIs(10)` max steps
- `Tool.tsx` component: collapsible tool invocation display
- `Confirmation.tsx` component: approval UI for privileged operations
- Agent mode indicator in QuickChatPanel
- Tools automatically enabled when active sandbox session exists

## [0.14.2] - 2026-02-14

### Changed
- Migrated to `useChat` (AI SDK v6) with `DefaultChatTransport` and UIMessage `parts[]` rendering

## [0.14.1] - 2026-02-14

### Changed
- Per-message performance: atomFamily normalized state with React.memo

## [0.14.0] - 2026-02-14

### Added
- AI Elements: Suggestion component, Reasoning component, Shimmer loading indicator

## [0.11.0] - 2026-02-13

### Added
- Phase B: Structured Intelligence (upgrades AI SDK from streamText-only to structured output)
- Code Analysis: `streamObject()` with progressive panel, complexity meter (1-10), severity-badged issues
- Smart Commit Message: `generateObject()` with editable type/scope/subject/body card
- Test Results Parser: auto-detects Jest/Vitest/pytest/Mocha output with pass/fail/skip counts
- Stack Trace Parser: clickable frames, dimmed node_modules, opens file in editor
- Shared Zod schemas for structured AI output
- Editor context menu + Cmd+Shift+A for code analysis

## [0.10.0] - 2026-02-13

### Added
- Vercel AI SDK integration for Quick Chat and Code Transform
- SSE streaming via `streamText()` with KV-persisted chat history (7-day TTL)
- Quick Chat slide-out panel (Cmd+Shift+Q) with provider toggle
- Code Transform with lazy Monaco DiffEditor (Cmd+Shift+T)
- Multi-provider support: Claude (Sonnet/Haiku/Opus) and Gemini (Flash/Pro)
- Claude API key support separate from OAuth tokens

## [0.9.6] - 2026-02-12

### Added
- Google Gemini AI integration: Claude can delegate tasks to Gemini via MCP tools
- Three Gemini tools: `gemini_quick_query` (Flash), `gemini_analyze_code` (Pro), `gemini_codebase_analysis` (Pro+files)
- AI Providers settings tab with API key management, model selection, and enable/disable toggle
- Gemini expert agent (`/agent:gemini-expert`) for full Gemini delegation mode
- Auto-retry with exponential backoff on Gemini rate limits (429)
- Guide tab updated with AI Providers usage documentation

### Fixed
- Session creation crash when Gemini config referenced before initialization (temporal dead zone)

## [0.9.5] - 2026-02-13

### Added
- VaporFiles tab in Settings: browse, upload, preview, and delete R2 files
- Image gallery with thumbnail grid and full-screen preview modal
- Drag-and-drop upload with visual drop zone indicator
- Copy shareable R2 URLs for any file

### Fixed
- Copy MD now respects multi-select: copies all selected issues
- File deletion bug: was passing ID without extension to R2

## [0.9.4] - 2026-02-09

### Added
- Command Center settings tab: edit internal container rules for Claude SDK
- VF rules prepended to CLAUDE.md in every sandbox
- Plugin refresh endpoint with state-preserving merge
- Config injection order documented in UI

## [0.9.3] - 2026-02-09

### Added
- Slash command autocomplete in chat
- Rich built-in command templates for /review, /test, /docs, /refactor
- Plugin discover supports monorepo subpaths and root-level convention dirs

### Fixed
- Catalog toggle bug: plugins no longer share URLs
- Marketplace install creates fallback commands from catalog metadata

## [0.9.2] - 2026-02-09

### Added
- Warp-style layout: chat centered (55%), editor+terminal in right sidebar (30%)
- SessionTabBar with horizontal tabs, double-click rename, hover close
- Focus mode (Cmd+3): collapse both sidebars for full-screen chat
- Right panel auto-expands when file opened from tree

## [0.9.1] - 2026-02-09

### Added
- 3-tier pricing: Free/$0, Pro/$20, Premium/$80
- Competitive comparison table (VF vs Cursor vs Codespaces vs Replit)
- Landing page visual overhaul with gradient text and keyword pills

## [0.9.0] - 2026-02-09

### Added
- Frontend MCP Relay: connect local MCP servers to cloud SDK via WebSocket relay
- Relay proxy in container, relay status indicator in header
- MCP settings tab for adding/removing relay servers

## [0.8.0] - 2026-02-09

### Added
- MCP server persistence (writes directly to ~/.claude.json in sandbox)
- Plugins and Agents settings tab with visual connections
- iPad safe area fix, GitHub repo browser, favorites list

## [0.7.1] - 2026-02-08

### Fixed
- Chat persistence: SDK stream now writes messages to KV
- Chat history survives page refresh and session reconnect

## [0.7.0] - 2026-02-08

### Added
- Secrets management CRUD UI (Settings > Secrets)
- Secrets stored per-user in KV, injected as env vars into sessions
- API never returns full values, only last-4-char hint
- Max 50 secrets per user, 10KB per value

## [0.6.0] - 2026-02-08

### Added
- Marketing landing page with hero, features, and how-it-works
- Pricing page with Pro tier at $20/month
- SPA moved to /app subdirectory
- Monorepo build: Astro landing + Vite SPA merged into single dist/

## [0.5.0] - 2026-02-08

### Added
- Touch-friendly copy buttons, iPad layout, dark/light theme toggle
- Haptic feedback, pull-to-refresh, pinch-to-zoom in editor/terminal
- Commands and MCP settings tabs, PWA raster icons

## [0.4.6] - 2026-02-07

### Added
- Debug panel with floating Dev button
- Image pasting (Cmd+V) into chat with auto-upload to sandbox

## [0.4.5] - 2026-02-07

### Added
- Session persistence (survives page refresh)
- Expand all / collapse all in file explorer

## [0.4.4] - 2026-02-07

### Added
- File upload (drag-and-drop) and download/export (individual + .tar.gz)

## [0.4.3] - 2026-02-07

### Added
- Session naming, auto-reconnect, time-ago timestamps

## [0.4.2] - 2026-02-07

### Fixed
- Clone repo double-clone bug
- File explorer breadcrumb navigation

## [0.4.1] - 2026-02-07

### Added
- Artifact blocks with copy, download, run actions
- Chain of thought reasoning timeline

## [0.4.0] - 2026-02-07

### Added
- AI Elements-inspired chat UI redesign
- Enhanced tool call blocks, code blocks with line numbers
- Collapsible reasoning blocks, upgraded prompt input

## [0.3.0] - 2026-02-07

### Added
- SDK crash fix (IS_SANDBOX, env spread, continue flag)
- Clone Repo modal, collapsible panels with Cmd+1/2/3 shortcuts

## [0.2.0] - 2026-02-07

### Added
- Claude can now create files, run commands, and edit code in the sandbox
- Rich chat UI with markdown rendering, syntax highlighting, and structured tool display
- Streaming SDK responses with structured tool-start/tool-result events

## [0.1.2] - 2026-02-06

### Added
- Stream Claude CLI responses in the terminal via SSE
- Session continuity with SDK resume parameter

## [0.1.1] - 2026-02-05

### Fixed
- Setup-token auth flow (replaced broken OAuth)
- Mobile-optimized layout with PWA support

## [0.1.0] - 2026-02-04

### Added
- Web-based Claude Code IDE on Cloudflare Sandboxes
- File explorer, Monaco editor, xterm.js terminal
- R2 bucket for file persistence
- Cloudflare Containers integration
