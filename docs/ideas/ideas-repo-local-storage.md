**Added:** 2026-03-11
**Status:** Done
**Category:** DX
**Priority:** P2

## Summary

Replace the global `~/.claude/ideas.md` catch-all with per-repo idea files under `docs/ideas/`. Each idea gets its own markdown file, the `/ideas` command is updated to write there, and `docs/ideas/INDEX.md` serves as the ranked navigation layer.

## Details

- One `.md` file per idea — git blame shows when each was captured, diffs are clean
- `docs/ideas/INDEX.md` as the index with Priority, Date, Title, Category, Status columns
- `/ideas` command updated to target `docs/ideas/` in the current working repo
- Existing `~/.claude/ideas.md` retained for global/cross-repo ideas but deprecated for project-specific ones
- Defunct jb-docs entries removed from global ideas file

## Next Steps

- Already implemented and committed
