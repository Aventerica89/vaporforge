# VaporForge: Secrets Management & 1Password Integration Plan

## Current Situation

- **1Password plan:** Individual ($3.99/mo via App Store)
- **Service account created:** Token starts with `ops_eyJzaWdu...` (saved to 1Password as "Service Account Auth Token: GitHub Actions")
- **Vaults:** Personal, Business, Work
- **Problem:** Sandbox container cannot use `op` CLI interactively. Needs either a service account token or secrets passed via env vars.

## Recommended Approach: Worker-Secrets Route (No Upgrade Needed)

The simplest path that works today, regardless of 1Password plan.

### How it works

```
1Password (JB's Mac, via op CLI or MCP tools)
    | (one-time deploy)
    v
Cloudflare Worker secrets (via wrangler secret put)
    | (at runtime, when creating sandbox session)
    v
Container env vars (passed in sandbox session env)
    | (sandbox Claude reads them)
    v
.env.local (sandbox Claude writes file from env vars)
```

### Step 1: Store secrets as Cloudflare Worker secrets

From JB's local machine, for each project that VaporForge might work on:

```bash
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put GITHUB_TOKEN
```

These get stored in the Worker's environment bindings (not in code, not in wrangler.toml).

### Step 2: Worker passes secrets to sandbox container

In the Worker code (where sandbox sessions are created), forward relevant secrets as env vars:

```typescript
const env = {
  ...baseEnv,
  ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY,  // already done
  TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: c.env.TURSO_AUTH_TOKEN,
  GITHUB_TOKEN: c.env.GITHUB_TOKEN,
  ENCRYPTION_SECRET: c.env.ENCRYPTION_SECRET,
  AUTH_SECRET: c.env.AUTH_SECRET,
}
```

### Step 3: Sandbox Claude uses env vars directly

Instead of running `op inject`, the sandbox Claude creates `.env.local` from available env vars:

```bash
cat > .env.local << 'ENVEOF'
TURSO_DATABASE_URL=${TURSO_DATABASE_URL}
TURSO_AUTH_TOKEN=${TURSO_AUTH_TOKEN}
ENCRYPTION_SECRET=${ENCRYPTION_SECRET}
AUTH_SECRET=${AUTH_SECRET}
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENVEOF
```

Or programmatically in Node.js by reading process.env.

## Alternative Approach: 1Password Service Account in Container

### Prerequisites
- May require upgrading to Teams Starter Pack ($19.95/mo) or Business ($7.99/user/mo)
- Service account already created but untested on Individual plan
- Test first: run `op vault list` with OP_SERVICE_ACCOUNT_TOKEN set

### If it works on Individual plan

1. Store OP_SERVICE_ACCOUNT_TOKEN as a Cloudflare Worker secret
2. Pass it to the container env
3. Install op CLI in the Dockerfile
4. Sandbox Claude runs: `op inject -i .env.local.tpl -o .env.local`

### Vault access limitation
- Service accounts CANNOT access Personal or Private vaults
- Must grant access to Business vault (where op://Business/... references point)
- Check: Developer > Service Accounts > click account > verify vault access includes "Business"

## wp-jupiter Specific Requirements

### Required env vars (from .env.local.tpl)

| Variable | Source |
|----------|--------|
| TURSO_DATABASE_URL | op://Business/TURSO_DATABASE_URL/credential |
| TURSO_AUTH_TOKEN | op://Business/TURSO_AUTH_TOKEN/credential |
| ENCRYPTION_SECRET | op://Business/ENCRYPTION_SECRET/credential (or generate with openssl) |
| AUTH_SECRET | op://Business/AUTH_SECRET/credential (or generate with openssl) |
| NEXT_PUBLIC_APP_URL | http://localhost:3000 (for dev) |

### Setup after secrets are available
```bash
cd /workspace/wp-jupiter
npm install           # already done
# Create .env.local from env vars (see Step 3 above)
npm run db:push       # push schema to Turso
npm run dev           # start dev server
```

## Decision Summary

| Approach | Cost | Complexity | Works today? |
|----------|------|-----------|-------------|
| Worker-secrets route | $0 | Low | Yes |
| 1Password service account | $0 or $7.99+/mo | Medium | Maybe (test token first) |
| Manual paste each session | $0 | High (tedious) | Yes |

**Recommendation:** Worker-secrets route. Same pattern already used for ANTHROPIC_API_KEY. No plan upgrade, no op CLI in container, no service account complexity.

## GitHub Actions (Separate Concern)

The service account token ("GitHub Actions") is still useful for CI/CD pipelines:
- Store as GitHub repo secret: OP_SERVICE_ACCOUNT_TOKEN
- GitHub Actions can run `op inject` to populate env during builds
- This is independent of the VaporForge sandbox approach

## Gemini CLI Integration (Future Consideration)

Discussed adding Gemini as a second model in VaporForge:

### Option 1: Model Router
- Add model selector in UI, route to Claude SDK or Gemini API
- Install @google/genai in container alongside Claude SDK
- Separate agent script: gemini-agent.js

### Option 2: Prompt Refinement Chain (Recommended)
- Gemini generates/refines prompts before sending to Claude
- Lightweight API call in Worker layer, not in container
- Keep Claude as primary executor with full sandbox integration

### Option 3: Specialized Roles
- Claude: coding, tool use, file operations (sandbox workflow)
- Gemini: research, summarization, prompt generation, long-context

### Practical notes
- Gemini lacks Claude SDK's tool-use/sandbox integration
- Session continuity differs (no sdkSessionId equivalent)
- Streaming formats differ between APIs
- Store GEMINI_API_KEY as Worker secret, same pattern as other keys

## Next Steps

1. Test service account token locally (set OP_SERVICE_ACCOUNT_TOKEN, run op vault list)
2. Store wp-jupiter secrets as Cloudflare Worker secrets via wrangler secret put
3. Update Worker code to forward secrets to sandbox env
4. Test: create VaporForge session, verify env vars are available in container
5. Sandbox Claude creates .env.local from env vars and runs wp-jupiter
