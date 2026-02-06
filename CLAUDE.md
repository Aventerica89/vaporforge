# VaporForge - Claude Code Context

## Project Overview

Web-based Claude Code IDE on Cloudflare Sandboxes. Access Claude from any device using your existing Pro/Max subscription.

**Live URL**: https://vaporforge.jbcloud.app

## MANDATORY RULE

**NEVER use Anthropic API keys for authentication.**

This project uses a setup-token flow: users run `claude setup-token` locally and paste the resulting token into VaporForge. The backend validates it against Anthropic's OAuth endpoint, then issues a session JWT. Each user's Claude token is stored per-user in KV.

## Auth Flow

1. User opens VaporForge, sees login page
2. User runs `claude setup-token` in their terminal
3. Pastes the token into the login form
4. Backend validates token via `POST https://api.anthropic.com/v1/oauth/token`
5. On success: creates user record in KV, issues session JWT
6. Token stored per-user in KV, session JWT in browser localStorage
7. Subsequent requests use session JWT; Claude token refreshed server-side

## Tech Stack

- **Backend**: Cloudflare Workers + Sandboxes
- **Frontend**: React + Vite + Tailwind
- **Auth**: Setup-token flow (Claude Pro/Max subscription)
- **Storage**: Cloudflare KV + R2

## Key Files

| File | Purpose |
|------|---------|
| `src/auth.ts` | Auth service (setup-token validation, JWT, refresh) |
| `src/router.ts` | API routes (POST /api/auth/setup) |
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
