# /deploy — Smart Deploy

VaporForge deploy with automatic Docker cache detection and changelog updates.

## Arguments

Parse `$ARGUMENTS`:
- `--msg="..."` — Tier 3 changelog message (skips prompt)
- `--feature` — Also update Tier 1 CHANGELOG.md (prompts for user-facing description)
- No args — runs full deploy, prompts for changelog message at end

## Steps

### 1. Pre-flight checks

Run these in parallel:
```bash
npm run typecheck 2>&1
npm run lint 2>&1
```

If either has errors, STOP and report them. Do not deploy broken code.

### 2. Detect container changes

Check whether sandbox scripts (not just Dockerfile metadata) actually changed:

```bash
git diff HEAD -- src/sandbox-scripts/ | head -5
git status --porcelain src/sandbox-scripts/
git diff HEAD -- Dockerfile | grep -v VF_CONTAINER_BUILD | head -5
git status --porcelain Dockerfile
```

Clear Docker cache **only if**:
- Any file in `src/sandbox-scripts/` has uncommitted changes, OR
- `Dockerfile` has changes **other than** the `VF_CONTAINER_BUILD` line

```bash
docker builder prune --all -f
docker image prune -a -f
```

Output: "Container cache cleared — sandbox scripts changed, new image will be built."

If only `VF_CONTAINER_BUILD` changed (or nothing changed): skip prune entirely.
Output: "Dockerfile unchanged — using cached Docker layers (fast deploy)."

### 3. Build

```bash
npm run build 2>&1
```

If build fails, STOP. Show the last 30 lines of output.

### 4. Deploy

```bash
npx wrangler deploy 2>&1
```

Capture output. Extract:
- New version ID: line matching `Current Version ID: ...`
- Container image hash: line matching `"image": "registry.cloudflare.com/...` (the `+` diff line)

### 5. Update changelogs

Get current version from `package.json`.
Get short git hash: `git rev-parse --short HEAD`

If `--msg="..."` was provided, use it directly.
Otherwise ask: "Changelog message for this deploy? (60 chars max)"

**Tier 3** — Append to `changelog-action.json`:
```json
{ "v": "{VERSION}", "ts": "{ISO8601_UTC}", "msg": "{MESSAGE}", "hash": "{SHORT_HASH}" }
```

**Tier 2** — Prepend to `CHANGELOG-DEV.md` under today's date header:
```
### {YYYY}-{MM}-{DD} · {SHORT_HASH} · v{VERSION}
CHORE   deploy — {MESSAGE}
```

If `--feature` flag: also update `CHANGELOG.md` Tier 1 (prompt for user-facing description).

### 6. Commit changelog entries

```bash
git add changelog-action.json CHANGELOG-DEV.md CHANGELOG.md
git commit -m "chore: update changelogs for deploy {SHORT_HASH}"
git push
```

### 7. Summary

Output:
```
✓ Deployed vaporforge v{VERSION}
  Version ID: {VERSION_ID}
  Container: {IMAGE_HASH} ({new/cached})
  Commit: {SHORT_HASH}
  Changelog: updated (Tier 2 + Tier 3)
```
