**Added:** 2026-03-13
**Status:** Idea
**Category:** VaporForge / Integrations

# GitHub Authentication — Private Repo Access

## Problem

Current repo import is a manual URL paste flow — clunky and limited to public repos. No way to import private repos without a PAT workaround.

## Idea

Implement GitHub OAuth like 1Code does: user connects their GitHub account once, VF shows a real repo picker (search, filter by org/personal, stars, recency) with full access to private repos.

## Implementation Sketch

1. GitHub OAuth app (vaporforge.dev) — scopes: `repo`, `read:org`
2. Store GitHub access token in KV alongside user record
3. `/api/github/repos` endpoint — lists user's repos (paginated, searchable)
4. Replace URL paste in Agency Mode / session init with a repo picker UI
5. Clone uses stored token: `git clone https://oauth2:{token}@github.com/org/repo`

## Reference: 1Code UX (confirmed)

1Code (1code.dev/async) does exactly this. Confirmed UX flow:
1. GitHub App install screen → user picks org (Aventerica89, JBMD-Creations)
2. Repo picker: searchable list, org avatars, private repos included
3. Branch picker: live branches, recency timestamps, default badge, + Create button
4. Permissions page: "All repositories" or "Only select repositories" toggle

**VaporForge needs less than 1Code** — they request `read/write: code, issues, PRs, deployments`.
VF only needs: `contents: read` (clone) + `metadata: read` (repo list). Narrower = more trustworthy to users.

## Approach: GitHub App (not OAuth App)

After reviewing the [GitHub docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps):

**Use a GitHub App**, not an OAuth App:
- Fine-grained: user chooses exactly which repos (personal + orgs) to grant — better UX and trust
- Installation tokens are short-lived (1hr, auto-refreshed) — safer in KV than long-lived OAuth tokens
- Org repos included cleanly — no separate org approval dance
- Clone with installation token: `git clone https://x-access-token:{token}@github.com/org/repo`

**OAuth App is wrong here** — broad scope, long-lived token, requires deploy key workaround for cloning.
