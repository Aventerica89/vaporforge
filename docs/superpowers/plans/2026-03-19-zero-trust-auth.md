# CF Zero Trust Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace VaporForge's custom JWT auth with Cloudflare Zero Trust Access (GitHub + Google IdPs) so users authenticate via CF Access and link their Claude setup-token once.

**Architecture:** CF Access protects `/app/*` and handles OAuth + session cookies. The Worker validates the `Cf-Access-Jwt-Assertion` header using the `jose` package against CF's JWKS endpoint. User identity is the CF JWT `sub` claim (stable UUID). The Claude setup-token is linked to this identity in KV. Frontend removes all localStorage JWT handling — the `CF_Authorization` cookie is sent automatically.

**Tech Stack:** Cloudflare Zero Trust (Access), `jose` (JWT validation), Cloudflare KV, Hono middleware

---

## Prerequisites (Manual — CF Dashboard)

Before any code changes, the developer must configure CF Zero Trust. These steps cannot be automated via code.

### Step 0: CF Zero Trust Setup

- [ ] **Step 0.1:** Log into [Cloudflare One](https://one.dash.cloudflare.com/) and create/verify your Zero Trust organization. Note your **team name** (e.g., `vaporforge`). Your team domain will be `https://vaporforge.cloudflareaccess.com`.

- [ ] **Step 0.2: Add GitHub IdP**
  1. Go to GitHub > Settings > Developer Settings > OAuth Apps > New OAuth App
  2. Application name: `VaporForge`
  3. Homepage URL: `https://vaporforge.cloudflareaccess.com`
  4. Authorization callback URL: `https://vaporforge.cloudflareaccess.com/cdn-cgi/access/callback`
  5. Register, copy **Client ID** and **Client Secret**
  6. In CF One > Integrations > Identity Providers > Add > GitHub
  7. Enter Client ID and Secret, Save, Authorize

- [ ] **Step 0.3: Add Google IdP**
  1. Go to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials > Create OAuth Client
  2. Application type: Web application
  3. Authorized redirect URI: `https://vaporforge.cloudflareaccess.com/cdn-cgi/access/callback`
  4. Copy **Client ID** and **Client Secret**
  5. In CF One > Integrations > Identity Providers > Add > Google
  6. Enter Client ID and Secret, Save

- [ ] **Step 0.4: Create Access Application**
  1. CF One > Access Controls > Applications > Add Application > Self-Hosted
  2. Application name: `VaporForge App`
  3. Application domain: `vaporforge.dev`
  4. Path: `/app/*` (also add `/api/*` as additional path)
  5. Session duration: 24 hours
  6. Copy the **Application Audience (AUD) Tag** — you need this for JWT validation

- [ ] **Step 0.5: Create Access Policy**
  1. Policy name: `Allow Alpha Users`
  2. Action: Allow
  3. Include rule: Emails — add specific alpha tester emails (or `*` for open alpha)
  4. Save

- [ ] **Step 0.6: Customize Login Page**
  1. CF One > Settings > Custom Pages > Access Login
  2. Upload VaporForge logo
  3. Set background color to `#0a0e17` (VF dark theme)
  4. Set header text: "Sign in to VaporForge"
  5. Save

- [ ] **Step 0.7: Test in browser**
  1. Open incognito window, go to `vaporforge.dev/app/`
  2. Should redirect to CF login page with VF branding
  3. Sign in with GitHub — should redirect back to `/app/`
  4. Check browser cookies: `CF_Authorization` should be set on `vaporforge.dev`
  5. Check request headers in DevTools: `Cf-Access-Jwt-Assertion` should be present

---

## Task 1: Add `jose` dependency and CF Access JWT validation utility

**Files:**
- Modify: `package.json` (add `jose`)
- Create: `src/cf-access.ts` (new file — CF Access JWT validation)

- [ ] **Step 1: Install jose**

```bash
npm install jose
```

- [ ] **Step 2: Create `src/cf-access.ts`**

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';

export interface CfAccessIdentity {
  email: string;
  sub: string;        // Stable user UUID from CF
  country?: string;
}

/**
 * Validate a Cloudflare Access JWT from the Cf-Access-Jwt-Assertion header.
 * Returns the user identity or null if validation fails.
 *
 * CF docs: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
export async function validateCfAccessJwt(
  request: Request,
  teamDomain: string,
  policyAud: string,
): Promise<CfAccessIdentity | null> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`)
    );

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: policyAud,
    });

    if (!payload.email || !payload.sub) return null;

    return {
      email: payload.email as string,
      sub: payload.sub,
      country: payload.country as string | undefined,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/cf-access.ts
git commit -m "feat: add CF Access JWT validation utility with jose"
```

---

## Task 2: Add CF Access env vars to wrangler config and Env type

**Files:**
- Modify: `wrangler.jsonc` (add TEAM_DOMAIN, POLICY_AUD vars)
- Modify: `src/types.ts` (add to Env interface)

- [ ] **Step 1: Read current `wrangler.jsonc` vars section**

Find where environment variables are defined. Add:

```jsonc
"vars": {
  // ... existing vars ...
  "TEAM_DOMAIN": "https://vaporforge.cloudflareaccess.com",
  "POLICY_AUD": "<paste-the-AUD-tag-from-step-0.4>"
}
```

- [ ] **Step 2: Add to Env interface in `src/types.ts`**

```typescript
// In the Env interface, add:
TEAM_DOMAIN: string;
POLICY_AUD: string;
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add wrangler.jsonc src/types.ts
git commit -m "feat: add CF Access TEAM_DOMAIN and POLICY_AUD env vars"
```

---

## Task 3: Update Worker auth middleware to try CF Access JWT first

**Files:**
- Modify: `src/auth.ts` (add CF Access path to `extractAuth`)
- Modify: `src/router.ts` (pass new env vars)

- [ ] **Step 1: Read `src/auth.ts` `extractAuth` function**

Read the current `extractAuth()` implementation (around line 292). Understand how it extracts the Bearer token from the Authorization header and validates via `AuthService`.

- [ ] **Step 2: Add CF Access as primary auth path**

Modify `extractAuth` to try CF Access JWT first, fall back to old JWT:

```typescript
import { validateCfAccessJwt, type CfAccessIdentity } from './cf-access';

export async function extractAuth(
  request: Request,
  authService: AuthService,
  teamDomain?: string,
  policyAud?: string,
): Promise<User | null> {
  // 1. Try CF Access JWT (new path)
  if (teamDomain && policyAud) {
    const cfIdentity = await validateCfAccessJwt(request, teamDomain, policyAud);
    if (cfIdentity) {
      // Look up user by CF identity (sub claim = stable UUID)
      const user = await authService.getUserByCfSub(cfIdentity.sub, cfIdentity.email);
      if (user) return user;
    }
  }

  // 2. Fall back to old Bearer token JWT (backward compat during migration)
  const authHeader = request.headers.get('Authorization');
  // ... existing Bearer token logic ...
}
```

- [ ] **Step 3: Add `getUserByCfSub` to AuthService**

```typescript
async getUserByCfSub(cfSub: string, email: string): Promise<User | null> {
  // Try CF identity key first
  const user = await this.kv.get<User>(`user:cf:${cfSub}`, 'json');
  if (user) return user;

  // No user yet for this CF identity — they'll need to link their Claude token
  // Return a partial user object so the middleware knows they're authenticated
  // but haven't linked their Claude token yet
  return {
    id: `cf:${cfSub}`,
    email,
    claudeToken: null,
    createdAt: new Date().toISOString(),
  } as User;
}
```

- [ ] **Step 4: Update all `extractAuth` call sites in `src/index.ts`**

Every call to `extractAuth(request, authService)` becomes:
```typescript
extractAuth(request, authService, env.TEAM_DOMAIN, env.POLICY_AUD)
```

There are ~3 call sites in `index.ts` (lines 96, 162, 195+).

- [ ] **Step 5: Update router middleware similarly**

Read `src/router.ts` to find where auth middleware runs. Update to pass `env.TEAM_DOMAIN` and `env.POLICY_AUD`.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/auth.ts src/index.ts src/router.ts
git commit -m "feat: add CF Access JWT as primary auth path with old JWT fallback"
```

---

## Task 4: Add "Link Claude Token" flow for new CF-authenticated users

**Files:**
- Modify: `src/api/auth-routes.ts` or equivalent (add link-token endpoint)
- Modify: Frontend login component

- [ ] **Step 1: Create `POST /api/auth/link-token` endpoint**

When a user is CF-authenticated but has no Claude token, they need to link one:

```typescript
// In auth routes
authRoutes.post('/link-token', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { claudeToken } = await c.req.json<{ claudeToken: string }>();
  if (!claudeToken?.startsWith('sk-ant-oat01-')) {
    return c.json({ error: 'Invalid Claude token format' }, 400);
  }

  // Validate token with Anthropic API
  const valid = await validateClaudeToken(claudeToken);
  if (!valid) {
    return c.json({ error: 'Token validation failed' }, 400);
  }

  // Store user with Claude token, keyed to CF identity
  const cfSub = user.id.replace('cf:', '');
  const fullUser: User = {
    ...user,
    claudeToken,
    linkedAt: new Date().toISOString(),
  };
  await c.env.AUTH_KV.put(`user:cf:${cfSub}`, JSON.stringify(fullUser), {
    expirationTtl: KV_USER_TTL,
  });

  return c.json({ success: true });
});
```

- [ ] **Step 2: Update frontend to detect "needs token linking"**

When the API returns a user with `claudeToken: null`, show the token linking UI instead of the session view. This replaces the current `LoginForm.tsx`.

The frontend should:
1. Check if user is CF-authenticated (API call succeeds with user data)
2. If `claudeToken` is null → show "Link your Claude token" form
3. If `claudeToken` exists → show normal app

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/api/ ui/src/
git commit -m "feat: add Claude token linking flow for CF-authenticated users"
```

---

## Task 5: Remove old localStorage JWT from frontend

**Files:**
- Modify: `ui/src/lib/api.ts` (remove Bearer header injection)
- Modify: `ui/src/lib/quickchat-api.ts` (same)
- Modify: `ui/src/lib/analyze-api.ts` (same)
- Modify: `ui/src/hooks/useVfChatWs.ts` (remove token from WS URL)
- Modify: Various components that read `session_token`

- [ ] **Step 1: Remove `Authorization: Bearer` from `api.ts` `request()` function**

The `CF_Authorization` cookie is sent automatically by the browser — no manual header needed. Remove all `localStorage.getItem('session_token')` and `Authorization: Bearer` header injection from:

- `ui/src/lib/api.ts` (~15 occurrences)
- `ui/src/lib/quickchat-api.ts` (line 6-9)
- `ui/src/lib/analyze-api.ts` (line 6-9)

Replace the auth header logic in each `request()` / `headers()` function with nothing — just remove the Authorization header entirely.

- [ ] **Step 2: Update WS authentication**

In `ui/src/hooks/useVfChatWs.ts`, the WS URL currently includes `?token=JWT`. CF Access cookie is NOT sent on WS upgrades automatically. Options:
- Keep the WS ticket system (already exists — `fetchWsTicket`)
- Or: read the `CF_Authorization` cookie and pass it as a query param

The WS ticket system already solves this — it exchanges the session for a short-lived ticket. Update it to work with CF Access: the ticket endpoint validates CF JWT, issues a ticket.

- [ ] **Step 3: Remove login form and session_token localStorage usage**

Search all frontend files for `session_token` and remove/replace:
```bash
grep -rn 'session_token' ui/src/
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Deploy and test end-to-end**

```bash
npx wrangler deploy
```

Test:
1. Open incognito → `vaporforge.dev/app/`
2. CF redirects to login page → sign in with GitHub
3. Redirected to `/app/` → should see "Link your Claude token" form
4. Paste Claude token → should see normal VaporForge app
5. Reload → should stay authenticated (no login, no token re-entry)
6. Sign in with Google in different incognito → same flow

- [ ] **Step 6: Commit**

```bash
git add ui/src/
git commit -m "feat: remove localStorage JWT, rely on CF Access cookie auth"
```

---

## Task 6: KV data migration for existing users (optional, post-launch)

This is deferred — only needed when migrating existing alpha testers from old auth to CF auth. Not blocking for initial launch since there are no external users yet.

- [ ] **Step 1: Write migration script**

Script that reads all `user:*` keys, matches by Claude token, and creates `user:cf:*` aliases.

- [ ] **Step 2: Run migration**

Execute via wrangler or a one-off Worker endpoint.

---

## Known Gotchas (from CF docs research)

### 1. SPA Session Expiry Breaks AJAX (CRITICAL)
SPA sub-requests get redirected to login instead of 401 when session expires.
**Fix:** Add `X-Requested-With: XMLHttpRequest` header to ALL fetch requests in `api.ts`, `quickchat-api.ts`, `analyze-api.ts`. This makes CF return 401 instead of redirect. Frontend detects 401 → shows "session expired" → redirects to re-auth.

### 2. WebSocket Auth
CF Access validates `CF_Authorization` cookie on the initial WS upgrade (HTTP 101). Once connected, the WS stays open even if session expires. Good for us — long chat sessions won't break. Still validate JWT in Worker on upgrade as defense-in-depth.

### 3. HttpOnly Cookie (JS Can't Read It)
`CF_Authorization` has HttpOnly enabled by default (good for security). Frontend can't check "am I logged in?" by reading the cookie. **Fix:** Create `GET /api/auth/me` endpoint that returns user info. Frontend calls this on mount instead of reading localStorage.

### 4. Path Wildcard Doesn't Cover Parent
`/app/*` protects `/app/anything` but NOT `/app` itself.
**Fix:** Add BOTH `/app` and `/app/*` as application paths in CF Access config. Same for `/api` and `/api/*`.

### 5. CORS Preflight (OPTIONS) Gets 403'd
Browsers never send cookies with OPTIONS requests → CF blocks them.
**Fix:** Enable "Bypass OPTIONS requests to origin" in CF Access app Advanced > CORS settings.

### 6. Internal Endpoints Need Bypass
`/internal/stream` (container→DO callback) and container WS connections are Worker-to-DO internal calls. They don't carry CF Access cookies.
**Fix:** These routes are NOT user-facing — they go through DO stubs, not public HTTP. CF Access only applies to routes matching the app config. As long as `/internal/*` isn't in the Access app paths, it's fine. Verify by NOT adding `/internal/*` to the Access application.

### 7. Seat Expiration
Each authenticated user consumes 1 seat (50 max free). Users hold seats until removed.
**Fix:** Enable seat expiration (1 month inactivity) in CF One > Settings > Admin controls.

### 8. Logout URL
CF provides `vaporforge.dev/cdn-cgi/access/logout` for session termination.
**Fix:** Add logout button to VF Settings that redirects to this URL.

### 9. PWA Cookie Risk
iOS PWA standalone mode should send same-origin cookies, but this is untested with CF Access specifically.
**Fix:** Test on iOS PWA immediately after deploying CF Access. If cookies aren't sent, may need to adjust cookie SameSite settings in CF Access app config.

### 10. Preview URLs (Sandbox Ports)
Preview URLs use `*.vaporforge.dev` subdomains (e.g., `8080-sandbox123.vaporforge.dev`). If CF Access is set on `*.vaporforge.dev`, these get blocked.
**Fix:** CF Access app should target specific paths (`/app/*`, `/api/*`), NOT wildcard subdomain. Preview URLs use different subdomains and won't match.

---

## Testing Checklist

- [ ] CF Access blocks unauthenticated requests to `/app` and `/app/*`
- [ ] CF Access blocks unauthenticated requests to `/api` and `/api/*`
- [ ] Landing page (`/`, `/pricing`, `/login`) remains accessible without auth
- [ ] Preview URLs (`*.vaporforge.dev`) remain accessible without Access gate
- [ ] `/internal/*` routes are NOT gated by Access
- [ ] GitHub OAuth flow works end-to-end
- [ ] Google OAuth flow works end-to-end
- [ ] CF JWT is validated correctly in Worker
- [ ] Invalid/expired CF JWTs are rejected
- [ ] Claude token linking works for new users
- [ ] Existing sessions work via old JWT fallback (during migration)
- [ ] WS streaming works with CF auth (cookie sent on upgrade)
- [ ] AJAX requests get 401 (not redirect) when session expires
- [ ] CORS preflight (OPTIONS) requests succeed
- [ ] `GET /api/auth/me` returns user info from CF JWT
- [ ] Logout button at `vaporforge.dev/cdn-cgi/access/logout` clears session
- [ ] Mobile PWA (iOS) sends CF cookies correctly in standalone mode
- [ ] Mobile PWA (Android) sends CF cookies correctly
