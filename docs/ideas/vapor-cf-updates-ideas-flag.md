**Added:** 2026-03-11
**Status:** Done
**Category:** DX
**Priority:** P2

## Summary

Add `--ideas` flag to `/vapor-cf-updates` that bypasses CF source scanning and instead extracts ideas from the current terminal session, saves them as individual files in `docs/ideas/`, and prints a ranked index view sorted by priority.

## Details

- Early-exit branch (same pattern as `--update-dashboard`) — skips Steps 1-7 entirely
- Extracts ideas from conversation context: explicit proposals, deferred items, patterns from external sources
- Each idea gets a kebab-case filename, Priority (P1/P2/P3/Backlog), Category, Summary, Details, Next Steps
- Deduplicates against existing files — won't overwrite
- Re-sorts `docs/ideas/INDEX.md` by Priority then Date after each run
- Prints ranked index table at end of run

## Next Steps

- Already implemented in `.claude/commands/vapor-cf-updates.md`
