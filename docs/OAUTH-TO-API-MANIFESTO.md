# VaporForge: OAuth-to-API Architecture Manifesto

## What This Document Covers

How VaporForge lets users access Claude Code from any device using their existing Anthropic Pro/Max subscription, without exposing API keys in the browser. This is a BYOT (Bring Your Own Token) architecture.

---

## The Problem

Claude Code runs locally — it requires a terminal, Node.js, and a logged-in session. You can't use it from a phone, tablet, or any machine without the CLI installed. VaporForge solves this by running Claude Code in a cloud sandbox, authenticated with the user's own Anthropic credentials.

The challenge: how do you securely bridge a user's local Anthropic OAuth token to a cloud container?

---

## Architecture Overview

```
Browser (React SPA)
    |
    | HTTPS + JWT session cookie
    v
Cloudflare Worker (Hono router)
    |
    | Retrieves user's Claude token from KV
    | Injects token as env var into sandbox
    v
Cloudflare Sandbox Container (Docker)
    |
    | CLAUDE_CODE_OAUTH_TOKEN env var
    | Runs: node /opt/claude-agent/claude-agent.js
    v
@anthropic-ai/claude-agent-sdk
    |
    | Uses OAuth token to authenticate
    v
Anthropic API (api.anthropic.com)
```

**Key principle**: The OAuth token never touches the browser after initial setup. It's stored server-side in KV and injected into containers at runtime.

---

## Authentication Flow (Step by Step)

### Step 1: User Generates a Setup Token

On their local machine (where Claude Code is already logged in):

```bash
claude setup-token
```

This outputs a token starting with `sk-ant-oat01-` (OAuth Access Token).

### Step 2: User Pastes Token into VaporForge

The VaporForge login page has a single input field. The user pastes their token.

### Step 3: Worker Validates and Stores the Token

```
POST /api/auth/setup
Body: { "token": "sk-ant-oat01-..." }
```

The Worker's `AuthService` (src/auth.ts):
1. Validates the token prefix (`sk-ant-oat01-` or `sk-ant-api01-`)
2. Hashes the token with SHA-256 to derive a stable `userId`
3. Stores the user record (including raw token) in Cloudflare KV with 30-day TTL
4. Creates a session JWT (HMAC-SHA256, 24-hour expiry) and returns it
5. Frontend stores the JWT in localStorage

### Step 4: Subsequent Requests Use JWT

Every API request includes `Authorization: Bearer <jwt>` or a `session=<jwt>` cookie. The Worker:
1. Verifies the JWT signature and expiry
2. Looks up the user record from KV using the JWT's `sub` claim
3. Retrieves the stored Claude token from the user record

### Step 5: Token Injection into Sandbox

When the user sends a chat message (`POST /api/sdk/stream`):
1. Worker validates the user's `claudeToken` exists and has the correct prefix
2. Passes it as `CLAUDE_CODE_OAUTH_TOKEN` env var to `sandbox.execStream()`
3. The claude-agent.js script inside the container reads it from `process.env`
4. The Agent SDK uses it to authenticate with Anthropic's API

---

## Key Source Files

| File | Role |
|------|------|
| `src/auth.ts` | AuthService class — token validation, JWT creation, KV storage, token refresh |
| `src/api/sdk.ts` | SDK streaming route — validates token, injects into sandbox, pipes SSE |
| `src/sandbox.ts` | SandboxManager — container lifecycle, `collectProjectSecrets()` for env forwarding |
| `src/types.ts` | Zod schemas for User, Session, SetupTokenRequest |
| `src/router.ts` | Hono routes including `POST /api/auth/setup` |
| `Dockerfile` | Container image — installs Claude Code CLI + Agent SDK, embeds claude-agent.js |
| `src/sandbox-scripts/claude-agent.js` | Runs inside container — uses Agent SDK `query()` with OAuth token |
| `ui/src/hooks/useAuth.ts` | Frontend auth state (JWT storage, login/logout) |
| `ui/src/components/AuthGuard.tsx` | Login UI with token input field |

---

## How the Claude Agent SDK Runs Inside the Container

The Dockerfile installs two things globally:
- `@anthropic-ai/claude-code` (the CLI, required by the SDK)
- `@anthropic-ai/claude-agent-sdk` (the programmatic SDK)

The claude-agent.js script is embedded at `/opt/claude-agent/claude-agent.js`. When called:

```bash
node /opt/claude-agent/claude-agent.js '<prompt>' '<sessionId>' '<cwd>'
```

It:
1. Imports `query` from `@anthropic-ai/claude-agent-sdk`
2. Reads `CLAUDE_CODE_OAUTH_TOKEN` from env
3. Calls `query({ prompt, options })` with `permissionMode: 'bypassPermissions'` and `IS_SANDBOX: '1'`
4. Streams JSON lines to stdout (text-delta, tool-start, tool-result, done)
5. The Worker reads these via `sandbox.execStream()` and re-emits as SSE to the browser

Session continuity: The SDK returns a `session_id` which is stored in KV. On subsequent messages, `resume: sessionId` is passed to maintain conversation context.

---

## Security Model

### What's Protected
- OAuth tokens are stored in Cloudflare KV (encrypted at rest)
- Tokens never appear in browser after initial paste
- JWT session tokens expire after 24 hours
- User records expire after 30 days of inactivity
- Container env vars are ephemeral (destroyed with container)

### What's NOT Protected (by design)
- The user's Anthropic API usage is billed to their own account
- VaporForge has zero visibility into API costs or usage
- If a token is compromised in KV, the attacker gets Claude access (mitigated by 30-day TTL)

### Token Refresh
The AuthService supports OAuth token refresh via `POST https://api.anthropic.com/v1/oauth/token` with the `refresh_token` grant type. If a refresh token is stored, the Worker can transparently renew expired access tokens.

---

## Project Secrets Forwarding

Beyond the Claude token, VaporForge can forward additional secrets from Worker env to sandbox containers. These are defined in `src/sandbox.ts`:

```typescript
const PROJECT_SECRET_KEYS = [
  'OP_SERVICE_ACCOUNT_TOKEN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'GITHUB_TOKEN',
  'ENCRYPTION_SECRET',
  'AUTH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
```

To add a new secret:
1. Add the key name to `PROJECT_SECRET_KEYS`
2. Run `npx wrangler secret put KEY_NAME`
3. The secret is automatically available in all sandbox containers

---

## Setup Guide: Manual

### Prerequisites
- Cloudflare account with Workers Paid plan ($5/mo)
- Anthropic Pro or Max subscription
- Node.js 20+ and npm

### Steps

1. **Clone and install:**
   ```bash
   git clone https://github.com/Aventerica89/vaporforge.git
   cd vaporforge
   npm install
   ```

2. **Configure wrangler.toml:**
   ```toml
   name = "vaporforge"
   main = "src/index.ts"
   compatibility_date = "2025-01-01"

   [vars]
   JWT_SECRET = "generate-with-openssl-rand-hex-32"

   [[kv_namespaces]]
   binding = "SESSIONS_KV"
   id = "your-kv-namespace-id"

   [[r2_buckets]]
   binding = "FILES_BUCKET"
   bucket_name = "vaporforge-files"
   ```

3. **Create KV namespace:**
   ```bash
   npx wrangler kv namespace create SESSIONS_KV
   ```

4. **Set JWT secret:**
   ```bash
   npx wrangler secret put JWT_SECRET
   # Paste: output of `openssl rand -hex 32`
   ```

5. **Build the container image:**
   ```bash
   docker builder prune --all -f  # CRITICAL: clear cache first
   npx wrangler deploy
   ```

6. **Build and deploy the UI:**
   ```bash
   cd ui && npm install && npm run build
   # Deploy dist/ to your preferred static host (CF Pages, Vercel, etc.)
   ```

7. **Generate your setup token:**
   ```bash
   claude setup-token
   ```

8. **Open the app, paste the token, start coding.**

---

## Setup Guide: With Claude Code

If you have Claude Code available, the setup is significantly faster:

1. **Tell Claude what you want:**
   ```
   "Set up VaporForge — a cloud Claude Code IDE on Cloudflare Workers + Sandboxes."
   ```

2. **Claude will:**
   - Clone the repo
   - Detect `wrangler.toml` and create KV namespaces
   - Generate and store `JWT_SECRET` in 1Password via MCP
   - Deploy the Worker with `npx wrangler deploy`
   - Build and deploy the UI
   - Guide you through `claude setup-token`

3. **For env var management:**
   - Claude uses 1Password MCP to store/retrieve secrets
   - `deploy_env_vars` pushes them to Cloudflare
   - `.env.local.tpl` with `op://` references for local dev

---

## Comparison: OAuth Token vs API Key

| Aspect | OAuth Token (VaporForge) | API Key (Bricks-CC) |
|--------|------------------------|---------------------|
| Token format | `sk-ant-oat01-...` | `sk-ant-api03-...` |
| Source | `claude setup-token` (from logged-in CLI) | Anthropic Console |
| Auth method | OAuth 2.0 with refresh | Static API key |
| Where it runs | Inside sandbox container via Agent SDK | Server-side via Anthropic SDK |
| Billing | User's Pro/Max subscription | User's API credits |
| Token refresh | Supported (automatic) | N/A (no expiry) |
| Use case | Full Claude Code IDE (tools, files, terminal) | Single-purpose AI calls (structure generation) |
| SDK | `@anthropic-ai/claude-agent-sdk` | `@anthropic-ai/sdk` |

---

## Cost Model

VaporForge costs the platform operator nothing for AI usage:

| Component | Cost | Who Pays |
|-----------|------|----------|
| Cloudflare Worker | $5/mo (Paid plan) | Platform |
| KV Storage | Included in Workers | Platform |
| R2 Storage | Pennies (file uploads) | Platform |
| Sandbox compute | ~$0.01-0.05/session-hour | Platform |
| Claude API usage | $0 to platform | User (via their subscription) |

**Estimated total platform cost per user**: $3-5/month
**Target subscription price**: $20/month
**Margin**: ~80%

---

## Key Lessons Learned

1. **`IS_SANDBOX: '1'` is mandatory** — Without this env var, Claude Code CLI exits with code 1 when running as root with bypassPermissions.

2. **`options.env` replaces, doesn't merge** — Must spread `...process.env` then overlay custom vars.

3. **Docker heredoc cache trap** — Always `docker builder prune --all -f` before deploying container changes.

4. **No interactive terminal** — The SDK has `exec`, `execStream`, and `startProcess` but no PTY. Terminal is command-mode only.

5. **Session continuity via `resume`** — Pass `resume: sessionId` to maintain conversation context across messages.

6. **OAuth tokens can't be validated via Messages API** — They work differently from API keys. VaporForge validates the prefix format and trusts the token.

7. **Heartbeat SSE required** — Cloudflare edge and network intermediaries close idle connections after ~100s. Send heartbeat events every 30s.

---

*Last updated: 2026-02-07*
*VaporForge v0.4.7 | Repo: github.com/Aventerica89/vaporforge*
