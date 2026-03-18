**Added:** 2026-03-18
**Status:** Idea
**Category:** Marketing / Positioning

## North Star: Stable Alpha Launch

Everything leads here. Stability, auth, streaming, MCPs — all in service of a launch-ready product.

## Positioning

VaporForge is the full IDE experience built on Cloudflare's official Sandbox + Claude Code architecture. CF now documents this exact pattern as a tutorial (https://developers.cloudflare.com/sandbox/tutorials/claude-code/) — VaporForge is the premium, production-grade version.

**One-liner:** "Claude Code in your browser — persistent sessions, MCP integrations, file management, and Agency mode. Built on Cloudflare Sandbox."

## Differentiators vs CF Tutorial Demo

| CF Tutorial | VaporForge |
|-------------|------------|
| Paste repo URL + task, get diff | Full IDE with persistent sessions |
| One-shot execution | Walk-away persistence, crash recovery |
| No auth beyond API key | CF Zero Trust identity + Claude subscription linking |
| No integrations | MCP marketplace (10+ recommended) + custom servers |
| No file management | VaporFiles (R2-backed persistent storage) |
| No UI customization | Agency mode (visual website editor) |
| No streaming UI | Real-time WS streaming with markdown rendering |
| CLI output only | Rich UI: tool calls, reasoning, code blocks, test results |

## Differentiators vs Claude.ai

- Works on any device (PWA, mobile-first)
- Persistent sandbox filesystem across sessions
- Agency mode for visual editing
- Custom MCP server support
- QuickChat for quick AI tasks without sandbox overhead
- Uses your existing Claude Pro/Max subscription

## Key Messages

1. **"Use Claude Code from anywhere"** — phone, tablet, any browser
2. **"Your workspace persists"** — files, history, MCP configs survive across sessions
3. **"Built on Cloudflare"** — edge-native, enterprise infrastructure
4. **"Bring your Claude subscription"** — no separate AI billing

## Pre-Launch Checklist

1. [ ] CF best practices audit (stability)
2. [ ] CF Zero Trust auth (real identity layer)
3. [ ] Streaming polish (smooth token animation)
4. [ ] Recommended MCP integrations (10 one-click servers)
5. [ ] Link sharing (conversation/session sharing)
6. [ ] Landing page update (positioning, demo video)
7. [ ] Beta invite system (waitlist or access codes)

## CF Ecosystem Alignment

CF is heavily investing in the Agents + Sandbox pattern. VaporForge should position as the flagship app built on this stack:
- CF Sandbox (compute)
- CF Agents framework (orchestration, state)
- CF MCP Portals (integrations marketplace)
- CF Zero Trust (identity)
- CF AI Gateway (model routing, caching)
- CF Workers + DOs (backend)
- CF R2 (file storage)
- CF KV (config, user data)

Every major CF product is a building block. This is a strong story for CF partnerships and developer relations.
