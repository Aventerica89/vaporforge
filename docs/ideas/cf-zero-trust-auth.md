**Added:** 2026-03-18
**Status:** Idea
**Category:** Auth / Infrastructure

## Summary

Replace VaporForge's custom auth with Cloudflare Zero Trust Access as the identity layer. Users sign in via GitHub/Google OAuth (managed by CF), paste Claude setup-token once to link their AI subscription. Token persists in KV keyed to CF identity — never needs re-entry.

## Current Auth Flow

1. User pastes Claude setup-token
2. Backend validates via Anthropic API
3. Creates user record in KV, issues session JWT
4. JWT stored in browser localStorage
5. Every request includes JWT; token refreshed server-side

**Problems:** No real identity layer, session JWT is the only auth, no MFA, no SSO, no audit trail.

## Proposed Auth Flow (CF Zero Trust)

1. User hits `vaporforge.dev/app/` → CF Access intercepts
2. CF redirects to identity provider (GitHub, Google, email OTP)
3. User authenticates → CF sets `CF_Authorization` cookie + JWT in `cf-access-jwt-assertion` header
4. Worker extracts user email/identity from CF JWT on every request
5. First visit only: paste Claude setup-token → stored in KV keyed to CF identity
6. Subsequent visits: CF cookie authenticates, Worker auto-loads Claude token from KV

## What This Simplifies

| Current | With Zero Trust |
|---------|----------------|
| Custom JWT issuance | CF handles session management |
| localStorage JWT | HttpOnly cookie (more secure) |
| No identity beyond Claude token | Real user identity (email, name) |
| No MFA | MFA via identity provider |
| Manual session expiry | CF Access manages session TTL |
| No audit trail | CF Access logs all requests |

## Custom Login Page (Headless CF Access)

CF Access can work without its default login page. Our branded login UI initiates the OAuth flow; CF validates in the background. User never sees CF's corporate-looking page.

## Relationship to GitHub OAuth

GitHub OAuth for private repo access (already code-complete, per `github-auth-private-repos.md`) is separate — that's for repo cloning permissions. But if we use GitHub as a CF Access identity provider, the user's GitHub identity is already established, which could simplify the repo access flow later.

## Timeline

Pre-alpha launch. This is foundational — better to have real auth before inviting users than to migrate later.

## Next Steps

1. Enable CF Access on `vaporforge.dev/app/*` (free tier: 50 users)
2. Configure GitHub + Google as identity providers
3. Test headless flow (custom login page → CF Access OAuth)
4. Migrate user KV key from session-based to CF identity-based
5. Add setup-token linking step post-CF-auth
6. Update frontend to read `CF_Authorization` cookie instead of localStorage JWT
