# /vapor-sync -- Full Project Synchronization

Comprehensive sync command for VaporForge. Audits and updates every spec, document, UI description, changelog, landing page, and plan file so the entire system reflects the current state of the codebase.

Run after major milestones, version bumps, or extended development periods.

## Arguments

Parse `$ARGUMENTS` for optional flags:
- `--dry-run` -- Report what needs updating without making changes
- `--section=<name>` -- Run only a specific section (e.g., `--section=changelog`)
- No arguments = full sync (all sections)

## Execution Strategy

Use **parallel subagents** for independent audit tasks, then sequential updates for files that depend on audit results. Create a worktree branch `sync/vapor-sync-YYYY-MM-DD` for all changes so they can be reviewed before merging.

## Sync Sections

Execute these in order. Sections 1-4 are **read-only audits** (run in parallel). Sections 5-10 are **updates** (sequential, informed by audits).

---

### Phase 1: Audit (Parallel Subagents)

Launch 4 parallel subagents to gather current state:

**Subagent A: Codebase State Snapshot**
- Read `package.json` for current version
- Run `git log --oneline` since last tag/release to get all changes
- Run `git diff --stat HEAD~20` to see recently touched files
- Read `ui/src/lib/version.ts` for in-app version and changelog entries
- Read `src/api/` route files to catalog all API endpoints
- List all Settings tabs (`ui/src/components/settings/*.tsx`)
- Count features: MCP servers, tools, UI components, keyboard shortcuts

**Subagent B: Documentation Audit**
- Read `CLAUDE.md` (project) -- check Architecture section, Key Files, Gotchas against actual codebase
- Read `~/.claude/projects/-Users-jb/memory/MEMORY.md` -- check version, status, roadmap accuracy
- Read all `docs/*.md` files -- flag anything outdated or contradicting current code
- Read all `docs/plans/*.md` -- check task completion status against git history
- Read `docs/PLAN.md` and `docs/plans/BACKLOG.md` -- flag completed items still listed as pending

**Subagent C: Landing Page Audit**
- Read `landing/src/components/Features.astro` -- compare feature cards against actual features
- Read `landing/src/components/Pricing.astro` -- check tier features match reality
- Read `landing/src/components/CompareTable.astro` -- check competitor comparison accuracy
- Read `landing/src/components/HowItWorks.astro` -- verify steps match current flow
- Read `landing/src/components/FAQ.astro` -- flag outdated answers

**Subagent D: Settings UI Audit**
- Read `ui/src/components/settings/GuideTab.tsx` -- check all sections reflect current features
- Read `ui/src/components/settings/CommandCenterTab.tsx` -- check SYSTEM_PROMPT and defaults
- Read `ui/src/components/settings/AboutTab.tsx` -- check version display and feature chips
- Read `ui/src/components/settings/McpTab.tsx` -- check descriptions match MCP capabilities
- Read `ui/src/components/settings/ClaudeMdTab.tsx` -- check help text accuracy
- Scan ALL Settings tab descriptions and helper text for outdated references

---

### Phase 2: Updates (Sequential)

#### Section 1: Version and Changelog Sync

**Files:** `package.json`, `ui/src/lib/version.ts`, `docs/CHANGELOG-manual.md`

1. Compare `package.json` version vs `ui/src/lib/version.ts` `APP_VERSION` -- align if mismatched
2. Check git log for commits since last `CHANGELOG-manual.md` entry
3. Add missing changelog entries in Keep a Changelog format
4. Update `CHANGELOG` array in `version.ts` with new entries (feature/fix/security tags)
5. Verify `AboutTab.tsx` will render the latest entry correctly

#### Section 2: Project CLAUDE.md Update

**File:** `CLAUDE.md` (project root)

1. Update Version number in header
2. Update Architecture section if new routes/bindings added
3. Update Key Files tables if new files created
4. Update Critical Gotchas with any new patterns learned this session
5. Update Development commands if build/deploy changed
6. Keep it concise -- CLAUDE.md should be a quick reference, not a novel

#### Section 3: Memory Files Update

**Files:** `~/.claude/projects/-Users-jb/memory/MEMORY.md` and topic files

1. Update version number and deployment status
2. Move completed roadmap items to "done" with version tags
3. Update "NEXT UP" section with actual next priorities
4. Check all "Known Issues" -- remove resolved ones, add new ones
5. Update Architecture section if it changed
6. Trim MEMORY.md if over 200 lines -- move detail to topic files

#### Section 4: Landing Page Feature Sync

**Files:** `landing/src/components/Features.astro`, `Pricing.astro`, `CompareTable.astro`

1. Add feature cards for capabilities not yet on landing page:
   - WebSocket streaming (v0.20.0)
   - MCP server management with JSON paste (v0.21.0)
   - Tool-calling agent for Quick Chat (v0.15.0)
   - Code analysis, commit messages, test/stack parsers (v0.11.0)
   - Any other features shipped since last landing page update
2. Update pricing tier features to reflect current capabilities
3. Update CompareTable if competitors changed or VF gained new advantages
4. Set `badge: 'New'` on recently added features, remove stale 'New' badges

#### Section 5: Settings UI Text Updates

**Files:** `ui/src/components/settings/GuideTab.tsx`, `CommandCenterTab.tsx`, `AboutTab.tsx`, and others

1. **GuideTab**: Add sections for new features (MCP management, WebSocket streaming, tool agent, etc.)
2. **CommandCenterTab**: Update `SYSTEM_PROMPT` constant if sandbox behavior changed
3. **AboutTab**: Update feature chips to include latest capabilities
4. **McpTab**: Update descriptions/placeholders if MCP workflow changed
5. Any tab with hardcoded text that references features -- update to match current state

#### Section 6: Manifesto Maintenance

**Files:** `docs/*-MANIFESTO.md`

1. Read each manifesto -- check if the described architecture still matches reality
2. Update file paths, function names, or patterns that changed since manifesto was written
3. Add "Status: Current" or "Status: Superseded by [newer approach]" headers
4. Don't rewrite entire manifestos -- just patch stale references

#### Section 7: Plan File Audit

**Files:** `docs/plans/*.md`, `docs/PLAN.md`, `docs/plans/BACKLOG.md`

1. For each plan file, check completed tasks against git history
2. Mark completed tasks with checkmarks
3. Flag any abandoned/superseded plans
4. Update BACKLOG.md -- remove completed items, add newly identified work
5. Check if any plan has items that should be in BACKLOG but aren't

#### Section 8: Notion Project Page Update

Use Notion MCP to update the VaporForge project page (`302cc9ae-33da-8143-a60a-c2a1b8f5252a`):
- Update current version
- Update feature highlights
- Update architecture notes if changed
- Update roadmap status

#### Section 9: Build Verification

1. Run `npm run typecheck` -- fix any type errors introduced by text updates
2. Run `npm run build` -- verify clean build
3. If landing page changed, verify Astro build succeeds

#### Section 10: Commit and Report

1. Stage all changes with descriptive commit message:
   ```
   chore: vapor-sync — update specs, docs, and landing page to v{version}
   ```
2. Generate summary report:

```
=== VAPOR-SYNC REPORT ===

Version: {current version}
Branch: sync/vapor-sync-{date}

Updated:
  - CLAUDE.md: {what changed}
  - MEMORY.md: {what changed}
  - Changelog: {N new entries}
  - Landing page: {N feature cards added/updated}
  - Pricing: {changes}
  - Settings UI: {N tabs updated}
  - Manifestos: {N patched}
  - Plans: {N tasks marked complete, N flagged stale}
  - Notion: {updated/skipped}

Skipped (no changes needed):
  - {list}

Ready to merge: git checkout main && git merge sync/vapor-sync-{date}
```

---

## Additional Checks (User requested: "anything else useful")

These are bonus checks included in every vapor-sync run:

- **Dead feature flags**: Grep for TODO/FIXME/HACK comments older than 2 weeks
- **Stale badges**: Find `badge: 'New'` in landing page that's more than 2 versions old
- **API route coverage**: Compare `src/api/*.ts` exports against `src/router.ts` registrations
- **Settings tab completeness**: Every Settings tab should have a corresponding GuideTab section
- **Package.json scripts**: Verify all `scripts` entries still work (no stale references)
- **Import health**: Quick check for unused imports in recently changed files
- **Dockerfile sync**: Compare `src/sandbox-scripts/` against embedded scripts in Dockerfile
- **KV key inventory**: List all KV key patterns used across the codebase for documentation

---

## When to Run

- After deploying a new version (the prompt: "deployed v0.X.Y")
- After completing a major feature branch merge
- Weekly maintenance (even without new features -- catches drift)
- Before creating a release or PR to main
- When you feel like "everything is out of sync"

## Important Notes

- NEVER modify code logic -- only documentation, descriptions, and static content
- ALWAYS create a sync branch -- never commit directly to main
- If unsure whether a description is accurate, flag it as `[NEEDS REVIEW]` rather than guessing
- Keep landing page copy marketing-friendly -- technical accuracy matters but so does appeal
- Pricing features should match what's actually enforced, not aspirational features
