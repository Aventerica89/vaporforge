# VaporForge - Claude Code Context

## Project Overview

Web-based Claude Code IDE on Cloudflare Sandboxes. Access Claude from any device using your existing Pro/Max subscription.

**Live URL**: https://vaporforge.jbcloud.app

## MANDATORY RULE

**NEVER use Anthropic API keys for authentication.**

This project MUST use Claude Pro/Max OAuth (1Code-style) flow. User cannot afford API costs. Any attempt to switch to API key authentication is unauthorized.

## Documentation

- **Implementation Plan**: `docs/PLAN.md` - Full OAuth fix plan and architecture
- **README**: `README.md` - Setup and deployment instructions

## Current Status

OAuth flow implemented but has bugs preventing URL extraction from CLI output.

### Known Issues (see docs/PLAN.md for fixes)

1. Wrong credentials path (`~/.claude/` instead of `~/.config/claude-code/`)
2. ANSI escape codes not stripped from terminal output
3. Wrong URL patterns (looking for `claude.ai/oauth` instead of `localhost:8080`)
4. Wrong credentials JSON structure

## Tech Stack

- **Backend**: Cloudflare Workers + Sandboxes
- **Frontend**: React + Vite + Tailwind
- **Auth**: Claude OAuth via CLI (1Code-style)
- **Storage**: Cloudflare KV + R2

## Key Files

| File | Purpose |
|------|---------|
| `src/api/oauth.ts` | OAuth flow - needs fixes |
| `src/types.ts` | TypeScript types |
| `ui/src/hooks/useAuth.ts` | Auth state management |
| `ui/src/components/AuthGuard.tsx` | Login UI |
| `ui/src/lib/api.ts` | API client |

## Development

```bash
npm run dev      # Start worker
npm run dev:ui   # Start UI (separate terminal)
npm run deploy   # Deploy to Cloudflare
```

## Cost Tracking

See `~/.claude/projects/-/memory/MEMORY.md` for monthly costs and cleanup instructions if scrapping project.
