# /bump-version — Version Bump

Atomically bump the VaporForge version across all 6 files that reference it.

## Arguments

Parse `$ARGUMENTS`:
- `--minor` — bump MINOR version (0.29.0 → 0.30.0)
- `--patch` — bump PATCH version (0.29.0 → 0.29.1)
- `--to=X.Y.Z` — explicit version
- No args — default to `--minor`

## Files to Update (in order)

Read current version from `package.json` first. Compute new version from flag.

### 1. `package.json`
```json
"version": "{NEW_VERSION}"
```

### 2. `ui/src/lib/version.ts`
Update `APP_VERSION`:
```ts
export const APP_VERSION = '{NEW_VERSION}';
```

Prepend entry to `DEV_CHANGELOG`:
```ts
{ date: '{YYYY-MM-DD}', summary: 'Version bump {OLD} → {NEW}' },
```

### 3. `CLAUDE.md`
Update the version line:
```
- **Version**: {NEW_VERSION}
```

### 4. `CHANGELOG.md` (Tier 1)
Prompt: "What user-facing features are in this release? (describe for CHANGELOG.md)"

Insert new section at top (after `# Changelog` header):
```markdown
## v{NEW_MAJOR}.{NEW_MINOR}.0 — {Month} {DD}, {YYYY}

{ENTRIES — use + Added, * Fixed, ~ Changed, - Removed}
```

### 5. `CHANGELOG-DEV.md` (Tier 2)
Prepend:
```
### {YYYY}-{MM}-{DD} · v{NEW_VERSION}
CHORE   version — bump {OLD} → {NEW}
```

### 6. `changelog-action.json` (Tier 3)
Append:
```json
{ "v": "{NEW_VERSION}", "ts": "{ISO8601_UTC}", "msg": "Version bump {OLD} → {NEW}", "hash": "{SHORT_HASH}" }
```

## Commit

Stage all 6 files and commit:
```bash
git add package.json ui/src/lib/version.ts CLAUDE.md CHANGELOG.md CHANGELOG-DEV.md changelog-action.json
git commit -m "chore: bump version to {NEW_VERSION}"
```

Output: "Version bumped: {OLD} → {NEW} across 6 files. Ready to /deploy."
