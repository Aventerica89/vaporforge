# Plan: GitHub App Integration

**Status:** Planned (not started)
**Priority:** High — enables seamless repo access without user token management
**Inspired by:** 1Code's "1Code - Async" GitHub App pattern

---

## Problem

Currently users must either:
1. Paste a GitHub token into VaporForge Secrets manually
2. Provide a public repo URL for cloning (no write-back)

This creates friction and blocks features like auto-commit, auto-PR, and private repo access without a token in the UI.

---

## Solution: GitHub App

A GitHub App gives VaporForge server-side access to repos the user installs it on.
Users install once → every VaporForge session gets a short-lived installation token automatically.

No API keys to manage. No token refresh logic visible to users. Clean UX.

---

## What This Enables (New Features)

- **Private repo access** without pasting tokens — install the app, VF can clone private repos
- **Auto-commit** — agent edits files in container → VF pushes commit to GitHub on behalf of user
- **Auto-PR** — after an agentic task completes, VF can open a PR automatically
- **Repo browser in New Session modal** — list repos the app is installed on, click to open
- **Push via container** — container `git push` works with the injected installation token
- **Agency mode GitHub repos** — pick a repo from your GitHub instead of pasting a URL

---

## Approval / Review Required?

**No.** GitHub Apps are self-service:
1. Create app at github.com/settings/apps/new (or org settings)
2. Define permissions, set install URL, add webhook URL
3. Live immediately — no review, no waiting
4. Users install via: `https://github.com/apps/vaporforge/installations/new`

GitHub Marketplace listing (NOT needed for VaporForge) does require review. We skip that entirely.

---

## Architecture

### App Setup (one-time)
- Create `vaporforge` GitHub App with permissions:
  - Repository: contents (read+write), pull requests (read+write), metadata (read)
- Store App ID + private key as Worker secrets: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`

### Install Flow (per user)
1. User clicks "Connect GitHub" in VaporForge Settings
2. Redirect to: `https://github.com/apps/vaporforge/installations/new`
3. GitHub redirects back to: `https://vaporforge.dev/api/github/callback?installation_id=...&setup_action=install`
4. Worker stores `installation_id` in KV: `user-github:{userId}:installation-id`

### Token Generation (per session)
- Before cloning a repo or pushing, Worker calls GitHub API:
  `POST /app/installations/{installation_id}/access_tokens`
  using JWT signed with the App private key → gets short-lived installation token (1hr TTL)
- Token injected into container as `GITHUB_TOKEN` env var
- Container uses it for `git clone`, `git push`, `gh` CLI commands

### Token Format
- JWT signed with RS256 using App private key (per GitHub App spec)
- Installation token valid 1hr, auto-refreshed before expiry
- Never stored in KV — generated fresh per session (or cached for 50min)

---

## Files to Create/Modify

### New
- `src/api/github-app.ts` — JWT signing, installation token generation, callback handler
- `src/api/github-app-routes.ts` — route definitions

### Modify
- `src/router.ts` — register new routes
- `src/config-assembly.ts` — call `getGithubInstallationToken()`, add to SandboxConfig
- `src/sandbox.ts` — add `githubToken?: string` to SandboxConfig interface
- `src/api/sdk.ts` — inject `GITHUB_TOKEN` into container env block
- `ui/src/components/settings/SettingsPage.tsx` — "Connect GitHub" button + status display
- `ui/src/lib/api.ts` — `githubAppApi` (connect, disconnect, status)
- `wrangler.toml` — add `GITHUB_APP_ID` var + `GITHUB_APP_PRIVATE_KEY` secret binding

---

## Implementation Phases

### Phase 1: App Setup + Install Flow
- [ ] Create GitHub App (`vaporforge`) with correct permissions
- [ ] Implement `/api/github/callback` — store installation_id in KV
- [ ] Implement `/api/github/connect` — redirect to GitHub install URL
- [ ] Implement `/api/github/status` — returns `{ connected: bool, login?: string, repos?: number }`
- [ ] Add "Connect GitHub" button in Settings → General/Integrations tab
- [ ] Store App ID + private key as Worker secrets

### Phase 2: Token Injection
- [ ] `getInstallationToken()` — JWT sign + POST to GitHub API
- [ ] Add to `assembleSandboxConfig()` / `SandboxConfig`
- [ ] Inject `GITHUB_TOKEN` in container env
- [ ] Container: configure `git credential.helper` to use `GITHUB_TOKEN`
- [ ] Test: clone a private repo, push a commit

### Phase 3: Repo Browser
- [ ] `GET /api/github/repos` — list repos accessible via installation
- [ ] New Session modal: "From GitHub" tab with repo list + search
- [ ] Replace raw URL input with picker (URL still works as fallback)

### Phase 4: Auto-Commit / Auto-PR (stretch)
- [ ] Agent completes a task → VF offers "Push & open PR" button
- [ ] One-click commit + push from the VF UI after agentic edits
- [ ] Auto-PR mode: configurable, creates PR automatically on task completion

---

## JWT Signing in CF Workers

CF Workers support `crypto.subtle` — can sign RS256 JWTs without any npm package:

```ts
const jwt = await signAppJWT(appId, privateKeyPem); // 10min TTL
const res = await fetch(`https://api.github.com/app/installations/${installId}/access_tokens`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
  },
});
const { token } = await res.json();
// token valid for 1hr
```

No `jsonwebtoken` package needed — pure Web Crypto API.

---

## Notes / Gotchas

- **Private key format**: GitHub gives a `.pem` file. Store as a Worker secret (multiline string). Use `crypto.subtle.importKey` with PKCS8 format.
- **Installation ID vs App ID**: The App ID identifies your app globally. Installation ID is per user-account install. Each user gets their own installation_id.
- **Multiple GitHub accounts**: A user could install on both personal + org accounts — they'll have multiple installation IDs. Start with one (most recent) and add multi-account later.
- **Webhook events** (optional): GitHub can notify VF when a push happens to an installed repo. Could trigger auto-sync of file tree. Low priority, add later.
- **Token cache**: Installation tokens last 1hr. Cache in KV with 50min TTL to avoid generating one per message. Key: `user-github:{userId}:install-token`.
