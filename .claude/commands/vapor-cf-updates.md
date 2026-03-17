# /vapor-cf-updates — Cloudflare Platform Updates Scanner

Research Cloudflare changelog, blog, and GitHub releases for platform updates relevant to VaporForge. Deduplicates against previous scans, writes a monthly Obsidian scan note, and keeps the CF Updates Dashboard current.

Run after a Cloudflare Birthday Week, after a major Workers/Containers/Agents SDK release, or weekly as maintenance.

## Arguments

Parse `$ARGUMENTS` for optional flags:
- `--help` — print usage and exit, no scanning
- `--dry-run` — scan and triage, print findings, but do NOT write any files
- `--update-dashboard` — skip scanning; only rebuild the dashboard from existing scan notes
- `--deep` — include package-level CHANGELOGs (ai-chat, agents, codemode) in addition to standard sources
- `--label <name>` — name for this scan section (e.g., `--label "Deep Scan"`)
- `--source <url>` — add a custom URL to scan (repeatable; each is fetched alongside standard sources)
- `--ideas` — skip CF scanning; capture ideas from the current session, save to `docs/ideas/`, and show ranked index
- No arguments = full scan + write note + update dashboard

If `--help` is set, print this and stop:

```
Usage: /vapor-cf-updates [flags]

Flags:
  --dry-run              Scan + triage but don't write any files
  --update-dashboard     Rebuild dashboard from existing notes (skip scan)
  --deep                 Include package-level CHANGELOGs (ai-chat, agents, codemode)
  --label <name>         Name for this scan section (e.g., "Deep Scan")
  --source <url>         Add custom URL to scan (repeatable)
  --ideas                Capture ideas from current session → docs/ideas/ + ranked index
  --help                 Show this message

No flags = full scan + write scan note + update dashboard

Files:
  Scan notes:  Obsidian-Claude/John Notes/VaporForge/Research/Cloudflare Changelog - {Month} {Year}.md
  Dashboard:   Obsidian-Claude/John Notes/VaporForge/Research/CF Updates Dashboard.md
  Ideas dir:   docs/ideas/
  Ideas index: docs/ideas/INDEX.md
```

---

## Execution

### Step 0: Setup

Define paths:
- **Research dir:** `/Users/jb/Obsidian-Claude/John Notes/VaporForge/Research/`
- **Dashboard file:** `{Research dir}/CF Updates Dashboard.md`
- **Scan note pattern:** `{Research dir}/Cloudflare Changelog - {Month} {Year}.md`
- **Current month note:** `{Research dir}/Cloudflare Changelog - {current month name} {current year}.md`

Get today's date in `YYYY-MM-DD` format.

If `--update-dashboard` flag is set, skip to Step 3.
If `--ideas` flag is set, skip to Step I (Ideas Capture).

---

### Step I: Ideas Capture (only when `--ideas` is set)

This step replaces the full CF scan flow. Do not proceed to Steps 1-7.

**Step I-1: Extract ideas from the current session**

Review the current conversation context. Identify any ideas, proposals, features, or improvements that were discussed — explicit ("we should add X") or implicit ("it would be nice if Y"). Also consider:
- Problems mentioned that don't have a solution yet
- Things that were deferred ("we'll do that later")
- Patterns from external sources (like Moltworker) that could be applied to VaporForge

For each idea found, determine:
- **Title** — short, descriptive (used as the heading and basis for the filename)
- **Filename** — kebab-case, max 40 chars (e.g., `sandbox-hot-reload.md`)
- **Category** — domain area: `Infrastructure`, `DX`, `Feature`, `Performance`, `UX`, `Security`
- **Priority** — rank based on impact and effort:
  - `P1` — high value, directly unblocks work or fixes a real pain point
  - `P2` — medium value, clear benefit but not urgent
  - `P3` — low value, nice to have or very speculative
  - `Backlog` — captured for later, no urgency
- **Summary** — one paragraph capturing the core insight
- **Details** — key implementation notes, API patterns, gotchas (bullet points)
- **Next Steps** — concrete actions, not vague aspirations

If no ideas are found in the conversation, say so and stop.

**Step I-2: Save idea files**

For each idea, write to `docs/ideas/{filename}`:

```markdown
**Added:** {YYYY-MM-DD}
**Status:** Idea
**Category:** {Category}
**Priority:** {P1 | P2 | P3 | Backlog}

## Summary

{one-paragraph summary}

## Details

{bullet points — key insights, patterns, API signatures, gotchas}

## Next Steps

- {concrete action 1}
- {concrete action 2}
```

Skip any idea whose filename already exists in `docs/ideas/` — don't overwrite existing files. Mention skipped duplicates in the summary.

**Step I-3: Update the ideas index**

Read `docs/ideas/INDEX.md`. For each new idea file created, insert a row into the index table. Then re-sort the entire table by Priority (P1 → P2 → P3 → Backlog), then by Date descending within each priority group.

The index table format (add `Priority` column if not already present):

```markdown
| Priority | Date | Title | Category | Status |
|----------|------|-------|----------|--------|
| P1 | 2026-03-11 | [Sandbox Hot Reload](sandbox-hot-reload.md) | Infrastructure | Idea |
```

Write the updated index back to `docs/ideas/INDEX.md`.

**Step I-4: Print summary**

```
=== IDEAS CAPTURED ===
Date:      {YYYY-MM-DD}
Session:   current conversation

Ideas saved ({N}):
  {filename} [{Priority}] — {Title}
  ...

Skipped (already exist):
  {filename} — {reason}
  ... (or "none")

Index:     docs/ideas/INDEX.md ({total} ideas total)

=== RANKED INDEX ===
{print the full updated index table}
```

Stop here. Do not continue to Steps 1-7.

---

### Step 1: Read Previous Scans

Glob all files matching `Cloudflare Changelog - *.md` in the Research dir.

For each file found:
- Read its content
- Extract all `### {Feature Title}` headings (H3 level) — these are known items
- Record the file's scan date from its `**Scanned:**` frontmatter line

Build a `knownTitles` set from all extracted headings (normalized to lowercase for comparison).

Determine `latestScanDate` = most recent scan date found across all files (or "none" if no files exist).

---

### Step 2: Scan Sources

Build the source list:

**Always included (fetch in parallel):**

**Source A — Cloudflare Developer Platform Changelog (RSS)**
URL: `https://developers.cloudflare.com/changelog/rss/developer-platform.xml`
Prompt: This is an RSS/XML feed. Extract all `<item>` entries. For each, capture: title (from `<title>`), date (from `<pubDate>`), link (from `<link>`), and description (from `<description>`). Only include entries with a pubDate after `{latestScanDate}` (or all entries if this is the first scan). Focus on entries related to: Containers, Sandboxes, Durable Objects, Workers, KV, R2, WebSockets, AI/ML, Agents SDK, streaming, build/deploy tools, Wrangler, MCP.

Jina fallback: `https://r.jina.ai/https://developers.cloudflare.com/changelog/rss/developer-platform.xml`
Final fallback (HTML): `https://developers.cloudflare.com/changelog/` — same extraction prompt, drop the date filter.

**Source B — Cloudflare Blog**
URL: `https://blog.cloudflare.com/`
Prompt: List all blog post titles and URLs visible on the page. Identify any posts related to: Containers, Sandboxes, Durable Objects, Workers, Agents, AI agent infrastructure, streaming, MCP, reference architectures (like Moltworker), R2, WebSockets.

**Source C — GitHub Releases (Wrangler)**
URL: `https://github.com/cloudflare/workers-sdk/releases`
Prompt: List the 10 most recent releases with their version numbers, dates, and key changes. Focus on: Wrangler CLI changes, container support changes, new deploy options, breaking changes.

Also attempt:
URL: `https://github.com/cloudflare/agents/releases` (or `cloudflare/agents-sdk/releases` — try both)
Prompt: List recent releases with version numbers, dates, and key changes.

**If `--deep` flag is set, also fetch (in parallel with above):**

**Source D — ai-chat CHANGELOG**
URL: `https://github.com/cloudflare/agents/blob/main/packages/ai-chat/CHANGELOG.md`
Prompt: Extract all version entries with their dates and changes. Focus on new features, breaking changes, and API additions.

**Source E — agents CHANGELOG**
URL: `https://github.com/cloudflare/agents/blob/main/packages/agents/CHANGELOG.md`
Prompt: Extract all version entries with their dates and changes. Focus on new features, breaking changes, and API additions.

**Source F — codemode CHANGELOG**
URL: `https://github.com/cloudflare/agents/blob/main/packages/codemode/CHANGELOG.md`
Prompt: Extract all version entries with their dates and changes. Focus on new features, breaking changes, and API additions.

**For each `--source <url>` flag provided:**
Fetch the URL with prompt: Extract all notable updates, features, releases, or changes relevant to: Cloudflare Workers, Containers, Durable Objects, Agents SDK, MCP, streaming, or AI agent infrastructure.

Track which sources succeeded and which failed for the summary report.

If any WebFetch fails, try the Jina fallback: `https://r.jina.ai/{original-url}`. If Jina also fails, mark as `failed` in the source status list.

---

### Step 3: Deduplicate

For each item found across all sources:
1. Normalize the title to lowercase
2. Check against `knownTitles`
3. Tag as:
   - `NEW` — not in any previous scan
   - `UPDATED` — title substring matches a known item (new version or additional detail)
   - `KNOWN` — exact match in previous scans (skip these)

Only carry `NEW` and `UPDATED` items forward.

---

### Step 4: Triage New Items

For each `NEW` or `UPDATED` item, classify:

**Impact:**
- `high` — directly affects VaporForge core functionality (container lifecycle, DO behavior, streaming, auth, MCP, build/deploy)
- `medium` — useful improvement to an existing VaporForge capability (performance, observability, DX)
- `low` — minor improvement or niche feature VaporForge could optionally adopt
- `irrelevant` — unrelated to VaporForge's stack (e.g., email, zone management, image CDN)

**Type:**
- `Stability` — improves reliability, resilience, or correctness of existing functionality (crashes, error handling, timeouts, recovery)
- `Feature` — new user-facing capability to build or expose
- `DX` — developer/build/deploy tooling improvement (Wrangler, CLI, compat dates, observability)
- `Infra` — platform limits, binding behavior, underlying infrastructure changes with no direct UX impact

**VF relevance:** One sentence explaining why it matters (or why it's irrelevant).

**VF files affected:** Which source files would need to change if adopted. Reference from these key files:
- `src/sandbox.ts` — container lifecycle, backup/restore, file inject
- `src/agents/chat-session-agent.ts` — V1.5 DO, keepAlive, streaming
- `src/container.ts` — WS upgrade, container class
- `src/config-assembly.ts` — MCP/secrets injection
- `src/api/sdk.ts` — WS chat, replay, persist
- `Dockerfile` — container image, scripts
- `wrangler.toml` — compat dates, bindings, limits

Drop `irrelevant` items entirely. Keep `high`, `medium`, `low`.

---

### Step 5: Write Scan Note

If `--dry-run`: print triage results and stop here. Do not write any files.

Determine the scan section heading:
- If `--label <name>` was provided: `## Scan: {YYYY-MM-DD} ({name})`
- Otherwise: `## Scan: {YYYY-MM-DD}`

Build the sources list string from what was actually fetched (e.g., `Changelog, Blog, GitHub` or `Changelog, Blog, GitHub, ai-chat, agents, codemode, https://example.com`).

**If the current month's scan note already exists:**
Read it. Append a new scan subsection at the end with all new items.

**If no current month note exists:**
Create it with this structure:

```
# Cloudflare Changelog Research - {Month} {Year}

**Scanned:** {YYYY-MM-DD}
**Source:** changelog + blog + GitHub
**Purpose:** Identify CF platform updates relevant to VaporForge

---

## Scan: {YYYY-MM-DD}

**Sources:** {comma-separated list of sources actually fetched}

{items...}
```

Each appended scan section must also include the `**Sources:**` line immediately after the heading.

**Format for each item:**

```
### {Feature Title} ({CF date})

**What:** {description}
**Impact:** high | medium | low
**Type:** Stability | Feature | DX | Infra
**VF relevance:** {one sentence on why it matters}
**VF files:** `src/sandbox.ts`, etc.
**Source:** {URL}
**Related:** [[VibeSDK - Cloudflare Reference Platform]], [[VaporForge Architecture - Container R2 Relationships]]

{any additional notes, API signatures, code examples, or gotchas worth preserving}

---
```

**Backlink guidance:** For each item, check if any of these existing Obsidian notes are relevant, and include them as `[[backlinks]]`:
- `[[VibeSDK - Cloudflare Reference Platform]]` — anything about Agents SDK, DO patterns, MCP
- `[[VaporForge Architecture - Container R2 Relationships]]` — anything about R2, container storage, VaporFiles
- `[[To Investigate - claude-code-containers]]` — anything about container lifecycle, backup/restore
- `[[VaporForge V1.5 Swarm Resource Plan]]` — anything about ChatSessionAgent DO, V1.5 streaming
- `[[1Code Learning]]` — anything about Claude SDK patterns, sandbox scripts

Only include a backlink if genuinely relevant — don't add all of them to every item.

---

### Step 6: Update Dashboard

Read the dashboard at `CF Updates Dashboard.md` if it exists. Rebuild the full tracking table from ALL scan notes (re-read all `Cloudflare Changelog - *.md` files to extract every item).

**For each item in every scan note, extract:**
- Feature name (from H3 heading, strip the date suffix)
- CF date (from the heading parenthetical)
- Scanned date — the date of the scan note file being processed (from its `**Scanned:**` frontmatter line)
- Impact (from `**Impact:**` field)
- Type (from `**Type:**` field — `Stability`, `Feature`, `DX`, or `Infra`)
- Status — default to `👀 Watching` for new items. Preserve existing status if dashboard already has an entry for this feature.
- Reason — from `**VF relevance:**` field (truncated to ~60 chars for the table)
- VF Version — leave as `—` (filled in manually when shipped)
- Scan Note — `[[Cloudflare Changelog - {Month} {Year}]]` backlink

**Status values (emoji-prefixed — always include the emoji):**
- `👀 Watching` — monitoring, not acting yet (default for new items)
- `🔍 Researching` — actively investigating source/docs
- `✅ Accepted` — decision made to adopt, planned for implementation
- `❌ Rejected` — not adopting (reason required in Reason column)
- `🧪 Attempted` — in progress or tried, incomplete / blocked
- `🔧 Implemented` — code written, not yet deployed
- `✔️ Verified` — tested and confirmed working in staging
- `🚀 Shipped` — deployed to production
- `⏸️ Blocked` — waiting on upstream dependency or prerequisite

When rebuilding from existing notes, infer status from the `**VF relevance:**` field language:
- "directly solves", "fixes", "enables" → `✅ Accepted`
- "proposal only", "not available yet", "watch" → `👀 Watching`
- "study", "investigate", "actively" → `🔍 Researching`
- Otherwise → `👀 Watching`

ALWAYS preserve any status already set in the dashboard file — never downgrade a status (e.g., don't reset `🚀 Shipped` to `👀 Watching` when rebuilding). Status only moves forward.

**After collecting all rows, sort the tracking table by:**
1. Impact: `high` first, then `medium`, then `low`
2. Within the same impact level: by CF Date descending (newest first)

Write the full dashboard:

```markdown
# CF Updates Dashboard

**Last scan:** {YYYY-MM-DD}
**Total tracked:** {N} items

## Status Key

| Status | Meaning |
|--------|---------|
| 👀 Watching | Monitoring — interesting but not acting yet |
| 🔍 Researching | Actively investigating — digging into source/docs |
| ✅ Accepted | Decision made to adopt — planned for implementation |
| ❌ Rejected | Not adopting — see Reason column |
| 🧪 Attempted | In progress or tried — incomplete / blocked |
| 🔧 Implemented | Code written — not yet deployed |
| ✔️ Verified | Tested and confirmed working in staging |
| 🚀 Shipped | Deployed to production |
| ⏸️ Blocked | Waiting on upstream dependency or prerequisite |

## Tracking Table

| Feature | CF Date | Scanned | Impact | Type | Status | Reason | VF Version | Scan Note |
|---------|---------|---------|--------|------|--------|--------|------------|-----------|
{rows...}

## Changelog

| Date | Action |
|------|--------|
{entries...}
```

Add a new row to the Changelog table:
- With label: `| {today} | Scan ({label}) — {N new items} found |`
- Without label: `| {today} | Scan — {N new items} found |`

---

### Step 7: Summary

Print to the user:

```
=== CF UPDATES SCAN ===
Scanned:      {YYYY-MM-DD}
Latest scan:  {latestScanDate or "first scan"}

Sources:      {comma-separated list of all sources attempted}
  Changelog:  ok (RSS) | ok (HTML fallback) | failed (Jina fallback also failed)
  Blog:       ok | failed
  GitHub:     ok | failed
  ai-chat:    ok | failed | (not fetched — no --deep flag)
  agents:     ok | failed | (not fetched — no --deep flag)
  codemode:   ok | failed | (not fetched — no --deep flag)
  {url}:      ok | failed  (one line per --source, if any)

New items:    {N}
Updated:      {N}
Known/skip:   {N}

Written to:   Cloudflare Changelog - {Month} {Year}.md
Dashboard:    CF Updates Dashboard.md ({total} items tracked)
```

If `--dry-run`, replace the last two lines with:
```
(dry run — no files written)
```

---

## Notes

- NEVER overwrite existing scan notes — always append new scan sections
- Preserve existing dashboard status values (especially `Implemented` and `Accepted`) when rebuilding
- If a source URL is unreachable after the Jina fallback, note it in the summary as "Source A: failed" and continue with available sources
- The scan note is append-only history; the dashboard is the current-state view rebuilt from all notes
- Keep scan note entries detailed (API signatures, gotchas, code examples) — the dashboard is just a summary table

