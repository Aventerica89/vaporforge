# VaporForge: Business Plan, Costs & Integration Strategy

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

## Cost Breakdown: Per-User Economics

### Cloudflare Pricing (Workers Paid Plan - $5/mo base)

| Resource | Included free/mo | Overage rate |
|----------|-----------------|--------------|
| CPU | 375 vCPU-minutes | $0.00002/vCPU-second |
| Memory | 25 GiB-hours | $0.0000025/GiB-second |
| Disk | 200 GB-hours | $0.00000007/GB-second |
| Network egress (NA/EU) | 1 TB | $0.025/GB |

### Estimated cost per user per month

| Item | Calculation | Cost |
|------|------------|------|
| CPU | ~30 min active/session x 60 sessions/mo = 1800 min | ~$2.16 |
| Memory | ~512MB provisioned during active sessions | ~$0.50 |
| Disk | Sandbox storage while active | ~$0.30 |
| Network | Code transfer, streaming responses | ~$0.50 |
| **Total per active user** | | **~$3-5/mo** |

### Revenue model at $20/mo subscription

| Metric | Value |
|--------|-------|
| Revenue per user | $20.00 |
| Cloudflare cost per user | ~$3-5 |
| Anthropic API cost | $0 (user's own account) |
| **Margin per user** | **$15-17 (~80%)** |
| Break-even users (covering $5 base) | 1 user |

Notes:
- Sandboxes only charge for active CPU, not idle time (scale-to-zero)
- Heavy users (developers coding all day) might cost $8-10/mo
- Light users (occasional use) might cost $1-2/mo
- Usage caps on concurrent sandboxes and session duration help control outliers

## Competitive Landscape: 1Code Comparison

### What is 1Code?

1Code (1code.dev) by 21st.dev is the closest direct competitor. Open-source orchestration
layer for Claude Code with a visual UI. They describe it as "Claude Code, but usable."

### Feature comparison

| Feature | VaporForge | 1Code |
|---------|-----------|-------|
| **What it is** | Cloud IDE with Claude in sandboxes | Visual client for Claude Code |
| **Auth model** | User's Anthropic OAuth/setup-token | User's Claude Pro/Max subscription |
| **Execution** | Cloudflare Sandboxes (fully cloud) | Local (Mac/Linux/Windows) + cloud web |
| **Mobile** | Yes (mobile-first UX, v0.3.x) | Yes (mobile monitoring app) |
| **Install required** | No (browser-only) | Desktop app download or web |
| **Parallel agents** | Single session (multi planned) | Multiple parallel agents |
| **Git integration** | Clone repo into sandbox | PR preview, merge from UI |
| **Open source** | No | Yes (GitHub) |
| **Pricing** | TBD (~$20/mo?) | $20/mo Pro, $100/mo Max |
| **API cost to user** | On their Anthropic account | On their Claude Pro/Max subscription |

### Where VaporForge differentiates

1. **Zero install** - Works from any browser, any device. No Mac app, no download.
2. **True cloud execution** - Code runs in Cloudflare sandboxes, not on user's machine.
   User's laptop can sleep, sandbox keeps running.
3. **Mobile-first UX** - Full mobile experience with keyboard-aware layout, drawer nav,
   bottom sheets (v0.3.x work). 1Code has mobile monitoring but not a full mobile IDE.
4. **Infrastructure included** - VaporForge provides the sandbox environment. 1Code requires
   the user to have Claude Code installed locally (or use their web sandboxes).

### Where 1Code is ahead

1. **Parallel agents** - Can run multiple Claude Code sessions simultaneously
2. **Open source** - Community trust, contributions, transparency
3. **Git workflow** - Built-in PR preview, merge, branch management
4. **Desktop integration** - Native Mac app with system-level access
5. **Established** - Already on Product Hunt, has user base

### Business model comparison

Both use the same fundamental model: user brings their own Anthropic subscription,
platform charges for the orchestration/infrastructure layer.

| Cost element | VaporForge | 1Code |
|-------------|-----------|-------|
| User pays Anthropic | Yes (Pro/Max) | Yes (Pro/Max) |
| User pays platform | ~$20/mo | $20-100/mo |
| Platform's API cost | $0 | $0 |
| Platform's infra cost | ~$3-5/user (Cloudflare) | Minimal (runs on user's machine for desktop) |
| Margin | ~80% | ~95%+ (desktop), lower for web sandboxes |

## Legality: Charging for VaporForge

### Allowed

Anthropic's commercial terms explicitly allow building paid products on top of their API.
You can "use the Services to power products and services you make available to your own
customers and end users." This is what Cursor, 1Code, Windsurf, and Replit all do.

### Not allowed

- Direct "reselling" of the raw API (pass-through proxy)
- Misrepresenting AI output as human-generated
- Violating Anthropic's Usage Policy (harmful content, etc.)

### What you need

- Your own Terms of Service for VaporForge users
- Usage limits/caps per subscriber (concurrent sandboxes, session duration)
- Clear disclosure that AI is involved
- Follow Anthropic's Usage Policy
- Privacy policy (you handle user data in KV/R2)

### VaporForge is clearly an application, not a resale

VaporForge adds significant value: sandbox environment, file management, IDE UI, mobile
experience, session management, auth flow. This is firmly in "application" territory.

## Next Steps

1. Test service account token locally (set OP_SERVICE_ACCOUNT_TOKEN, run op vault list)
2. Store wp-jupiter secrets as Cloudflare Worker secrets via wrangler secret put
3. Update Worker code to forward secrets to sandbox env
4. Test: create VaporForge session, verify env vars are available in container
5. Sandbox Claude creates .env.local from env vars and runs wp-jupiter
6. Draft Terms of Service and Privacy Policy for VaporForge
7. Set up usage caps (max concurrent sandboxes, session duration limits)
8. Consider Stripe integration for subscription billing
