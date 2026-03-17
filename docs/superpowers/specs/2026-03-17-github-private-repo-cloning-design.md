---
title: GitHub Private Repo Cloning & Dashboard CTA
type: feat
status: WORKING
scope: vaporforge
---

# GitHub Private Repo Cloning & Dashboard CTA

## Problem

When a user clicks a private repo from the MY REPOS grid on the VaporForge home screen, session creation fails with:

```
fatal: could not read Username for 'https://github.com': No such device or address
```

The Cloudflare Sandbox SDK's `gitCheckout()` method has no auth parameter — it runs a bare `git clone` which fails for private repos. The user's GitHub OAuth token (stored per-user in KV from the existing GitHub integration) is available but not passed to the clone step.

## Solution

Two changes:

### Part 1: Backend — Authenticated Git Clone (DONE)

**File: `src/sandbox.ts`**

Add `authenticateGitUrl()` helper that embeds the GitHub OAuth token into the HTTPS URL:

```
https://github.com/user/repo.git
→ https://oauth2:{token}@github.com/user/repo.git
```

This is the standard GitHub approach for token-based HTTPS cloning (used by GitHub Actions, CI systems, etc.).

**Call site**: In `createSandbox()`, before calling `sandbox.gitCheckout()`, transform the URL:
```ts
const cloneUrl = authenticateGitUrl(config.gitRepo, config.env?.GITHUB_TOKEN);
await sandbox.gitCheckout(cloneUrl, { targetDir, branch });
```

The token comes from `collectGithubToken()` which already reads from `github-token:{userId}` in AUTH_KV (populated by the GitHub OAuth flow built in the previous session).

**In-session git operations**: Already handled. `claude-agent.js` configures `git credential.helper` when `GITHUB_TOKEN` env var is present, so push/pull/fetch work inside the container.

**Agency mode call sites** (`startAgencySession`, `kickoffAgencySetup`): Not updated — agency repos are public Astro sites. Can be updated later if needed by threading a `githubToken` parameter through.

### Part 2: Frontend — MY REPOS Empty State CTA

**When GitHub is NOT connected** (no token in KV):

The MY REPOS section replaces the empty repo grid with a single CTA card:

```
MY REPOS
┌──────────────────────────────────────────────────┐
│  [GitHub icon]  Connect GitHub                    │
│  Import your repos for one-click sessions         │
│                                  [Connect] button │
└──────────────────────────────────────────────────┘
```

Clicking [Connect] triggers the existing OAuth flow (`GET /api/github/auth`).

**When GitHub IS connected:**

- Section header: `MY REPOS 44 · @{username}` with SYNC button (current behavior, add username)
- Repo grid shown (current behavior)
- Clicking a repo card creates a session with authenticated clone
- FAVORITES section shown below (current behavior)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Clone fails, no GitHub token | Toast: "Connect GitHub to clone private repos" with settings link |
| Clone fails, has token but repo inaccessible | Toast: "Failed to clone — check repo permissions" |
| Clone fails, other error | Existing error toast with error message |
| OAuth token expired/revoked | Clone fails → user sees error → reconnect via Settings or CTA |

### Files to Modify

| File | Change |
|------|--------|
| `src/sandbox.ts` | `authenticateGitUrl()` helper + update `createSandbox` call site (DONE) |
| `ui/src/components/HomeScreen.tsx` (or equivalent) | Add GitHub connection check, render CTA or repo grid conditionally |
| `ui/src/lib/api.ts` | Already has `getGithubStatus()` — use it to check connection state |

### No New API Endpoints

All endpoints exist from the previous session's GitHub OAuth work:
- `GET /api/github/auth` — initiates OAuth redirect
- `GET /api/github/callback` — handles OAuth callback, stores token
- `GET /api/github/status` — returns `{ connected, username }`
- `GET /api/github/repos` — paginated repo listing
- `DELETE /api/github/disconnect` — removes token

### Research: Industry Patterns

Researched 6 platforms (Vercel, Railway, Replit, CodeSandbox, Netlify, Render):
- All handle GitHub connection implicitly during project creation flow
- None show a GitHub connect button on the main dashboard
- CodeSandbox is closest to VaporForge with a dashboard "Repositories" section
- VaporForge's repo-centric dashboard is unique — the CTA in MY REPOS section is the natural VaporForge-specific pattern

### Known Limitations

- **Agency mode**: `startAgencySession` and `kickoffAgencySetup` do not thread the GitHub token. Private repos in Agency mode will fail. Tracked for future work — agency repos are currently public Astro sites only.
- **Token in `.git/config`**: The SDK's `gitCheckout()` may write the authenticated URL to `.git/config` as the remote origin. Post-clone, run `sandbox.exec('git', ['remote', 'set-url', 'origin', cleanUrl])` to strip credentials from the persisted config.

### Security Notes

- Token is embedded in the URL only for the `gitCheckout()` call — credentials stripped from `.git/config` after clone (see Known Limitations)
- `authenticateGitUrl()` only modifies `github.com` URLs — non-GitHub URLs pass through unchanged
- The OAuth token scope is `repo` (required by GitHub for private repo access — no read-only scope exists)
- Token rotation: if user reconnects GitHub, the new token is used for subsequent sessions automatically

### Testing Plan

- [ ] Deploy backend fix, create session with private repo (wp-dispatch) — verify clone succeeds
- [ ] Create session with public repo — verify still works (no regression)
- [ ] Create session with non-GitHub URL — verify passthrough works
- [ ] Disconnect GitHub, verify MY REPOS shows CTA
- [ ] Connect GitHub via CTA, verify repos load
- [ ] Clone private repo via MY REPOS card click — full end-to-end
