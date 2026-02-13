# Changelog

All notable changes to VaporForge are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-02-07

### Added
- Claude can now create files, run commands, and edit code in the sandbox
- Rich chat UI with markdown rendering, syntax highlighting, and structured tool display
- Streaming SDK responses with structured tool-start/tool-result events
- In-app changelog and version display on the welcome screen

### Fixed
- Increased chat timeout from 60s to 5 min for complex tool operations

## [0.1.2] - 2026-02-06

### Added
- Stream Claude CLI responses in the terminal via SSE
- Auto-prompt wrapping: plain text becomes `claude -p "..."`
- Session continuity with SDK resume parameter
- Hybrid SDK terminal with session management UI

## [0.1.1] - 2026-02-05

### Fixed
- Setup-token auth flow (replaced broken OAuth)
- Claude token injected as persistent sandbox env var
- Sandbox termination and timeout fixes

### Added
- Mobile-optimized layout with PWA support

## [0.1.0] - 2026-02-04

### Added
- Web-based Claude Code IDE on Cloudflare Sandboxes
- File explorer, Monaco editor, xterm.js terminal
- Resizable panels (desktop) and tab navigation (mobile)
- R2 bucket for file persistence
- Cloudflare Containers integration
