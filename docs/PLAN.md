# Plan: Claude in the Cloud with Cloudflare Sandboxes

## User Requirements (Confirmed)

- **Use Case**: All-in-one platform (mobile CLI, multi-agent, dev assistant)
- **Auth**: Setup-token flow (Claude Pro/Max subscription) - MANDATORY, NOT API keys
- **UI**: Full IDE-like experience (file tree, diff viewer, Monaco editor)

## Architecture

```
Mobile Browser / Desktop
    | HTTPS
Cloudflare Worker (Router)
    |-- Auth (setup-token -> JWT sessions)
    |-- WebSocket for real-time updates
    |-- Routes to Durable Objects
        |
Cloudflare Sandbox (Isolated Container)
    |-- Claude Agent SDK
    |-- Git operations
    |-- File system access
    |-- MCP servers (optional)
        |
Claude API (via user's Pro/Max token)
```

## Auth: Setup-Token Flow

### How It Works

1. User runs `claude setup-token` locally to get their OAuth refresh token
2. Pastes token into VaporForge login form
3. Backend validates by calling `POST https://api.anthropic.com/v1/oauth/token` with `grant_type=refresh_token`
4. On success: creates user in KV, stores encrypted token, issues session JWT (24h)
5. Subsequent requests use session JWT
6. Server-side token refresh via `refreshClaudeToken()` when access token expires

### Key Files

| File | Purpose |
|------|---------|
| `src/auth.ts` | `authenticateWithSetupToken()`, `refreshClaudeToken()`, JWT |
| `src/router.ts` | `POST /api/auth/setup` endpoint |
| `ui/src/hooks/useAuth.ts` | Zustand auth store with `login()` |
| `ui/src/components/AuthGuard.tsx` | Simple token paste form |

### Security

- Token validated server-side before user creation
- JWT sessions expire after 24 hours
- Refresh tokens stored in KV with 30-day TTL
- No API keys stored or accepted

## Cost Estimate

| Component | Estimate |
|-----------|----------|
| Cloudflare Workers Paid | $5/month base |
| Sandbox compute | Usage based |
| Claude Pro/Max | Existing subscription |
| **Total new costs** | **~$5-20/month** |
