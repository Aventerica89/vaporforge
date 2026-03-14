**Added:** 2026-03-13
**Status:** Idea
**Category:** VaporForge / Auth / Onboarding

## Summary

Replace the current "paste your setup-token" onboarding with a proper "Login with Claude" OAuth button. Anthropic likely has a browser-based OAuth flow for issuing `sk-ant-oat01-` tokens — 1Code.ai appears to already use it, prompting users via claude.ai and returning the token as a copy-paste snippet or using it directly.

## The Problem

Current onboarding requires:
1. User has Claude CLI installed locally
2. User runs `claude setup-token` in terminal
3. User copies the token
4. User pastes it into VaporForge's login form

This is a significant barrier — requires CLI installed, terminal familiarity, and a multi-step manual process.

## The Opportunity

If Anthropic exposes a standard OAuth 2.1 authorization code flow for issuing OAuth tokens, VaporForge can implement:

```
[Login with Claude] button
  → Redirect to accounts.anthropic.com/oauth/authorize (or similar)
  → User approves on claude.ai
  → AS redirects back to vaporforge.dev/auth/callback?code=...
  → Worker exchanges code for sk-ant-oat01- token
  → User is logged in
```

This is identical OAuth infrastructure to Google/GitHub login — same Worker-as-OAuth-client pattern from mcp-oauth-worker-as-client.md.

## Evidence

- 1Code.ai reportedly does OAuth with claude.ai to obtain a setup-token, presents it as a copy-paste snippet — suggests Anthropic has a web-based token issuance flow
- VaporForge already validates tokens via `POST https://api.anthropic.com/v1/oauth/token` — this IS an OAuth endpoint
- The Claude CLI's `setup-token` command likely uses device authorization flow or PKCE against an Anthropic auth endpoint

## Open Questions

1. Is there a documented public OAuth 2.1 authorization endpoint for Anthropic?
2. What redirect_uri / client_id would be required?
3. Does 1Code use an undocumented/partner flow, or is it public?
4. What scopes are available?

## Next Steps

1. Inspect 1Code.ai's OAuth flow (network tab) to find the actual authorization URL and parameters
2. Check Anthropic developer docs for OAuth app registration
3. Check if `https://accounts.anthropic.com/.well-known/oauth-authorization-server` returns metadata
4. If public: implement "Login with Claude" as primary auth method, keep paste-token as fallback

## Related

- `docs/ideas/mcp-oauth-worker-as-client.md` — same Worker-as-OAuth-client infrastructure, just different AS
- Current auth validation: `POST https://api.anthropic.com/v1/oauth/token` in `src/api/auth.ts`
