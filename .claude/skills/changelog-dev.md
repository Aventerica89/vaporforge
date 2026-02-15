---
name: changelog-dev
description: Toggle persistent dev changelog updates. When enabled, ALWAYS update version.ts CHANGELOG before every commit.
---

# Dev Changelog Toggle

**Command:** `/changelog-dev`
**Purpose:** Toggle automatic dev changelog updates on/off. When enabled, Claude MUST update the project's dev changelog before every commit.

## Arguments

Parse arguments for:
- No arguments - Toggle on/off (flip current state)
- `on` - Force enable
- `off` - Force disable
- `status` - Show current state without changing

## State File

`~/.claude/changelog-dev-state.json`:
```json
{
  "enabled": true,
  "project": "/Users/jb/vaporforge",
  "changelogFile": "ui/src/lib/version.ts",
  "enabledAt": "2026-02-14T12:00:00Z"
}
```

## Toggle Behavior

### When toggling ON:
1. Detect the current project directory
2. Find the changelog file (look for `version.ts` with `CHANGELOG` export)
3. Write state file with `enabled: true`
4. Confirm:
```
Dev changelog tracking: ON
Project: vaporforge
File: ui/src/lib/version.ts

Every commit will now include a CHANGELOG update.
```

### When toggling OFF:
1. Set `enabled: false` in state file
2. Confirm:
```
Dev changelog tracking: OFF
```

## MANDATORY BEHAVIOR WHEN ENABLED

**Before EVERY git commit**, Claude MUST:

1. **Check state**: Read `~/.claude/changelog-dev-state.json`
2. **If enabled**: Update the CHANGELOG array in the changelog file
3. **Rules for updating**:
   - If the current `APP_VERSION` already has an entry, ADD new items to it
   - If the version was bumped, CREATE a new entry at the top
   - Each item should be a concise, user-facing description (not a commit message)
   - Use the correct `tag`: `feature`, `fix`, `security`, or `breaking`
   - Set `date` to today's date in `YYYY-MM-DD` format
   - Keep items under 120 characters each
   - Focus on WHAT changed for the user, not implementation details

### Entry Format

```typescript
{
  version: '0.13.1',
  date: '2026-02-14',
  tag: 'feature',
  title: 'Short Title Describing the Release',
  items: [
    'User-facing change description 1',
    'User-facing change description 2',
  ],
}
```

### Updating vs Creating

- **Same version, same title context**: Add items to the existing entry's `items` array
- **Same version, different feature area**: Update the title to be broader, merge items
- **New version**: Create a new entry at position [0] in the array

### What NOT to include

- Internal refactoring (unless it enables user-visible improvements)
- Build/CI changes
- Comment or documentation-only changes
- Dependency updates (unless they fix user-visible bugs)

## Integration

This skill integrates with the commit workflow. When Claude is about to commit:

1. Read `~/.claude/changelog-dev-state.json`
2. If `enabled` is `true` AND the project directory matches:
   - Analyze the staged changes
   - Determine if they warrant a changelog entry
   - Update the changelog file
   - Stage the changelog file (`git add`)
   - Then proceed with the commit

## Project Detection

The `changelogFile` path is relative to the project root. To find it:
1. Check state file for saved path
2. If not saved, search: `grep -rl "export const CHANGELOG" ui/src/lib/`
3. Common locations: `ui/src/lib/version.ts`, `src/lib/version.ts`
