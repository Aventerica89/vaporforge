**Added:** 2026-03-18
**Status:** Idea
**Category:** Architecture / Vision

## Summary

Evolve from one-container-per-session to a dynamic container swarm. Spin up purpose-built containers on demand — MCP servers, dev servers, headless Chrome, tool runners — orchestrated by the ChatSessionAgent DO.

## The Big Idea

VaporForge is a local repo in the cloud. The sandbox IS your dev machine. But a real dev machine has more than a terminal — it has a browser, databases, preview servers, and tools running simultaneously. The container swarm makes that real.

## Architecture

```
User session (ChatSessionAgent DO = orchestrator)
├── Main Claude container (exists today)
├── MCP Server containers (on demand)
│   └── Postgres, GitHub, Slack, custom — each in isolated container
├── Dev Server container (on demand)
│   └── User's Astro/Next/Vite app running for live preview
├── Browser container (on demand)
│   └── Headless Chrome via CF Browser Rendering
│   └── Screenshots, visual testing, UI verification
├── AI Agent containers (on demand)
│   └── Different models — Gemini for review, local LLM for fast completions
└── Tool containers (on demand)
    └── FFmpeg, ImageMagick, Playwright, heavy CLI tools
```

## Killer Feature: Screenshots for UI Work

**No one is doing this in a cloud IDE.** Claude Code locally has claude-in-chrome for browser automation. VaporForge has nothing — it's the biggest gap.

With CF Browser Rendering + a dev server container:
1. Claude writes code in the main container
2. Dev server container runs `npm run dev` on the user's project
3. CF Browser Rendering takes screenshots of the running app
4. Claude sees the screenshots and iterates on the design
5. Full visual feedback loop — in the cloud, from any device

This turns Agency Mode from "edit code and hope" into "edit code, see result, iterate" — the same workflow developers have locally with a browser open next to their editor.

## Container Types

### MCP Server Containers
- Pre-built images for popular MCP servers (Postgres, GitHub, filesystem, etc.)
- User says "connect to my database" → spin up MCP container with right driver
- Relay routes through Worker to Claude's session
- Dies when disconnected — no resource waste

### Dev Server Containers
- Clone user's repo, install deps, run dev server
- CF Browser Rendering captures screenshots
- Claude gets visual feedback without user screenshotting manually
- Agency Mode becomes truly visual

### Browser Containers
- Headless Chrome for E2E testing
- Visual regression testing (screenshot diff)
- Form filling, login flow testing
- Could use Playwright or Puppeteer inside container

### Tool Containers
- Heavy tools that don't belong in the main image
- FFmpeg for video processing
- ImageMagick for image manipulation
- Puppeteer/Playwright for testing
- Language-specific toolchains (Rust, Go, Python ML)

## What Makes This Feasible

- CF Containers supports multiple instances per DO
- R2 FUSE mount gives shared filesystem across containers
- CF Browser Rendering provides headless Chrome at the edge
- DO-based architecture already handles session state
- Worker routes requests to the right container

## What's Hard

- Container startup latency (~2-5s per container)
- Inter-container networking (may need Worker as proxy)
- Cost scaling — more containers = more compute minutes
- Orchestration complexity in the DO
- Image management — pre-built vs user-defined containers

## Phased Approach

### Phase 1: Screenshot Loop (highest value)
- CF Browser Rendering + dev server in existing container
- Claude writes code → screenshot → iterate
- No new containers needed, just the rendering API

### Phase 2: MCP Server Containers
- Spin up isolated MCP servers on demand
- Replace current in-sandbox MCP approach
- Better isolation, more reliable

### Phase 3: Multi-Container Orchestration
- Separate dev server into its own container
- Add tool containers for heavy processing
- DO becomes a container scheduler

### Phase 4: Multi-Model Agents
- Different AI models in different containers
- Orchestrated by the DO for specialized tasks

## Shared Filesystem: The Real Unlock

R2 FUSE mount + container swarm = agents that share a real filesystem.

```
Container A (Claude) writes → /mnt/r2/project/app.tsx
Container B (Gemini reviewer) reads → /mnt/r2/project/app.tsx
Container C (test runner) reads → /mnt/r2/project/app.tsx
```

No prompts. No "here's the file content." Each agent has direct filesystem access to the same project. They see the real data — like developers on the same machine. Massively reduces token usage and latency vs passing file contents through messages.

## Reference Implementation

CF demos repo: https://github.com/cloudflare/containers-demos
- **load-balancer/** — KV-based service registry, self-registering containers, graceful shutdown
- **ai/** — AI generates code, runs in container, returns results
- **terminal/** — xterm.js proxied to container shell via WS (same pattern we built)

## Next Steps

- **Immediate**: Test CF Browser Rendering REST API from the Worker — can it screenshot a URL?
- **Phase 1 spike**: Run dev server in container, use Browser Rendering to screenshot localhost (may need container networking)
- **Research**: CF Container networking — can containers in the same DO talk directly?
- **R2 FUSE spike**: Mount R2 in container, verify shared read/write across instances
