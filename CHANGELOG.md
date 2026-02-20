# Changelog

All notable user-facing changes. See CHANGELOG-DEV.md for technical log.

<!-- Entries added by /changelog feature or deploy --feature flag -->

## v0.29.0 — February 20, 2026

+ Added   Model selector (S/H/O/Auto) — lock Claude to a specific model or let it auto-select per message
+ Added   Autonomy selector — choose how freely Claude acts without approval (Conservative / Standard / Autonomous)
+ Added   Cost meter — see per-message and session-total USD spend in real time
+ Added   Budget ceiling — set a max spend per session in Command Center to prevent runaway usage
+ Added   Execution Plan cards — Claude lays out a step-by-step plan before starting complex tasks
+ Added   Compaction indicator — banner appears when Claude is condensing its context window (no more silent pauses)
+ Added   Upgrade to Claude Sonnet 4.6 with 1M token context window beta

## v0.28.0 — February 20, 2026

+ Added   Question Flow — Claude can ask you structured questions (text, options, multi-select, yes/no) before starting a task
+ Added   Stream reconnect — if your connection drops mid-response, the stream auto-resumes from where it left off
+ Added   Citation cards — web search results show favicon, title, source domain, and a preview snippet
+ Added   Chat welcome state — suggestion chips appear on an empty chat to help you get started
~ Changed  Tool approval cards now highlight destructive actions (delete, drop, rm) with a red warning theme

## v0.27.0 — February 19, 2026

+ Added   Agency Code Mode — edit Astro component code and CSS directly with dual Monaco editors and Inline AI
+ Added   Shadow DOM inspector overlays — hover/click indicators no longer inherit your site's CSS styles
+ Added   GitHub repo browser — search and filter your repos when creating new Agency sites
+ Added   Debug panel — paste a screenshot and get AI analysis of CSS specificity issues

## v0.26.0 — February 18, 2026

+ Added   Agency Editor v2 — inspector now highlights specific child elements (buttons, images) not just the parent component
~ Changed  AI edits now include selected element HTML and full Astro source for surgical precision
~ Changed  Astro documentation MCP injected into every agency edit session
* Fixed    iframe auto-reloads after each AI edit so changes are immediately visible

## v0.25.0 — February 17, 2026

+ Added   Agency Mode — click any component on your live Astro site and describe edits in plain language
+ Added   Component tree sidebar with category grouping and visual inspector overlay
+ Added   Staging workflow — view the git diff and push changes live from the editor
