# Changelog

All notable changes to VaporForge are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
