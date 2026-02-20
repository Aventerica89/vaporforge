# Changelog

## v0.29.0 — February 20, 2026

+ Added   Execution Plan cards — Claude can now lay out a step-by-step plan before starting complex tasks
+ Added   Compaction indicator — a banner appears when Claude is condensing its context window (previously a silent pause)

## v0.28.0 — February 20, 2026

+ Added   Question Flow — Claude can now ask you structured questions before starting a task (text, options, multi-select, yes/no)
+ Added   Citation cards on web search results (favicon, title, source domain, preview snippet)
* Fixed   Tool approval cards now highlight destructive actions (delete, drop, wipe) in red

## [0.26.0] - 2026-02-18

### Added
- Agency Editor v2: Inspector now highlights specific child elements (buttons, headings, images) instead of only the parent component container
- Agency Editor v2: AI edits now include selected element HTML and full file source for surgical precision
- Agency Editor v2: Iframe auto-reloads after each AI edit so changes are immediately visible
- Agency Editor v2: Astro documentation MCP injected into every agency edit session (client:load, islands, component syntax)


## [Unreleased](https://github.com/Aventerica89/vaporforge/tree/HEAD)

[Full Changelog](https://github.com/Aventerica89/vaporforge/compare/62b07dc8df5f47612c8c6e28c13bd44d0c81a7f5...HEAD)

**Merged pull requests:**

- feat: VaporFiles manager tab + Copy MD multi-select fix [\#37](https://github.com/Aventerica89/vaporforge/pull/37) ([Aventerica89](https://github.com/Aventerica89))
- feat: hybrid SDK terminal + strategic merge from main [\#36](https://github.com/Aventerica89/vaporforge/pull/36) ([Aventerica89](https://github.com/Aventerica89))
- feat: streaming dedup with composite tool IDs [\#35](https://github.com/Aventerica89/vaporforge/pull/35) ([Aventerica89](https://github.com/Aventerica89))
- feat: plan mode with canUseTool enforcement [\#34](https://github.com/Aventerica89/vaporforge/pull/34) ([Aventerica89](https://github.com/Aventerica89))
- Address PR review feedback from Gemini Code Assist [\#33](https://github.com/Aventerica89/vaporforge/pull/33) ([Aventerica89](https://github.com/Aventerica89))
- Fix React StrictMode production errors [\#31](https://github.com/Aventerica89/vaporforge/pull/31) ([Aventerica89](https://github.com/Aventerica89))
- iOS PWA Optimization - Apple HIG Compliance [\#30](https://github.com/Aventerica89/vaporforge/pull/30) ([Aventerica89](https://github.com/Aventerica89))
- Optimize Debug Panel for iOS following Apple HIG [\#29](https://github.com/Aventerica89/vaporforge/pull/29) ([Aventerica89](https://github.com/Aventerica89))
- feat: add comprehensive validation and toast notifications to issue tracker [\#28](https://github.com/Aventerica89/vaporforge/pull/28) ([Aventerica89](https://github.com/Aventerica89))
- fix: ensure both text and image copy in issue tracker [\#27](https://github.com/Aventerica89/vaporforge/pull/27) ([Aventerica89](https://github.com/Aventerica89))
- feat: add export/import functionality to bug tracker [\#26](https://github.com/Aventerica89/vaporforge/pull/26) ([Aventerica89](https://github.com/Aventerica89))
- feat: enhance bug tracker copy to include screenshots [\#25](https://github.com/Aventerica89/vaporforge/pull/25) ([Aventerica89](https://github.com/Aventerica89))
- feat: add home button and bug tracker to mobile navigation [\#24](https://github.com/Aventerica89/vaporforge/pull/24) ([Aventerica89](https://github.com/Aventerica89))
- feat: @agent prefix + Tier 2 security [\#23](https://github.com/Aventerica89/vaporforge/pull/23) ([Aventerica89](https://github.com/Aventerica89))
- feat: explicit agent injection + preset system prompt [\#22](https://github.com/Aventerica89/vaporforge/pull/22) ([Aventerica89](https://github.com/Aventerica89))
- Issue Tracker UI: Editable Badges + Image Preview [\#21](https://github.com/Aventerica89/vaporforge/pull/21) ([Aventerica89](https://github.com/Aventerica89))
- iOS mobile optimizations for Plugin Marketplace [\#20](https://github.com/Aventerica89/vaporforge/pull/20) ([Aventerica89](https://github.com/Aventerica89))
- feat: live plugin sync + marketplace cyberpunk restyle [\#18](https://github.com/Aventerica89/vaporforge/pull/18) ([Aventerica89](https://github.com/Aventerica89))
- Fix Settings page header safe area and touch targets on iOS [\#17](https://github.com/Aventerica89/vaporforge/pull/17) ([Aventerica89](https://github.com/Aventerica89))
- Fix AuthGuard \(login screen\) safe area and touch targets for iOS [\#16](https://github.com/Aventerica89/vaporforge/pull/16) ([Aventerica89](https://github.com/Aventerica89))
- Fix safe area handling for all modals and panels on iOS [\#15](https://github.com/Aventerica89/vaporforge/pull/15) ([Aventerica89](https://github.com/Aventerica89))
- Fix iOS mobile layout cutoff and keyboard bounce issues [\#14](https://github.com/Aventerica89/vaporforge/pull/14) ([Aventerica89](https://github.com/Aventerica89))
- fix\(ios\): comprehensive iOS mobile improvements with TDD [\#13](https://github.com/Aventerica89/vaporforge/pull/13) ([Aventerica89](https://github.com/Aventerica89))
- Claude/fix desktop add button w7ws l [\#12](https://github.com/Aventerica89/vaporforge/pull/12) ([Aventerica89](https://github.com/Aventerica89))
- fix: MCP servers now persist — write directly to ~/.claude.json inste… [\#11](https://github.com/Aventerica89/vaporforge/pull/11) ([Aventerica89](https://github.com/Aventerica89))
- fix: add text-foreground color to settings add buttons [\#10](https://github.com/Aventerica89/vaporforge/pull/10) ([Aventerica89](https://github.com/Aventerica89))
- feat: plugins & agents settings tab with visual agent-command connections [\#9](https://github.com/Aventerica89/vaporforge/pull/9) ([Aventerica89](https://github.com/Aventerica89))
- fix: favicon now matches landing page logo — cyan \< + purple \> [\#8](https://github.com/Aventerica89/vaporforge/pull/8) ([Aventerica89](https://github.com/Aventerica89))
- Claude/vaporforge debug branch l l ij7 [\#7](https://github.com/Aventerica89/vaporforge/pull/7) ([Aventerica89](https://github.com/Aventerica89))
- fix: handle stale session resume crash with retry + clean error messages [\#6](https://github.com/Aventerica89/vaporforge/pull/6) ([Aventerica89](https://github.com/Aventerica89))
- feat: v0.4.0 — UI upgrade with AI Elements-inspired chat [\#5](https://github.com/Aventerica89/vaporforge/pull/5) ([Aventerica89](https://github.com/Aventerica89))
- feat: xterm.js terminal with streaming output [\#4](https://github.com/Aventerica89/vaporforge/pull/4) ([Aventerica89](https://github.com/Aventerica89))
- fix: UI consistency and slash command routing [\#3](https://github.com/Aventerica89/vaporforge/pull/3) ([Aventerica89](https://github.com/Aventerica89))
- feat: hybrid SDK terminal + session management UI [\#2](https://github.com/Aventerica89/vaporforge/pull/2) ([Aventerica89](https://github.com/Aventerica89))
- Debug/sandbox diagnostics [\#1](https://github.com/Aventerica89/vaporforge/pull/1) ([Aventerica89](https://github.com/Aventerica89))



\* *This Changelog was automatically generated by [github_changelog_generator](https://github.com/github-changelog-generator/github-changelog-generator)*
