# Developer Log

Technical log. Updated on every deploy.

<!-- Entries added automatically by deploy hook or /changelog dev -->

### 2026-02-27 · v0.30.0
FIX     settings — Persist V1.5 toggle to localStorage (vf_use_v15): survives hard refresh and new tabs; initialize useV15 from localStorage on store creation

### 2026-02-27 · v0.30.0
FIX     v15 — V1.5 callback response handler: add response event to callbackReq (consume body to prevent socket leak; log HTTP status if non-200 instead of silent 5-minute timeout); bump container build to 20260227b

### 2026-02-27 · v0.30.0
FIX     agent — Post-tool-use summary: add instruction to BASE_SYSTEM_APPEND and DEFAULT_VF_RULES so Claude always responds after tool use; bump container build to 20260227a

### 2026-02-26 · v0.30.0
FEAT    v15 — Stream buffering + reconnect: DO stores every NDJSON line to SQLite (buf:NNNNNNNNNN keys); browser detects v15-incomplete and resumes via GET /api/v15/resume?sessionId&offset; WORKER_BASE_URL var replaces hardcoded callback URL

### 2026-02-26 · v0.30.0
FEAT    ui — Add sonnet[1m] model option: Sonnet with 1M token context window; internal ID sonnet1m resolves to CLI alias in WS + V1.5 paths
FEAT    ui — Add opusplan model option: Opus for planning, Sonnet for execution (native Claude Code alias); pass through WS + V1.5 paths

### 2026-02-26 · v0.30.0
SECURITY rate-limit — KV-based rate limiting: auth endpoints 10/min per IP, AI generation 30/min per user
SECURITY error-msg — Sanitize error responses: remove token format hints (router.ts), internal details (sdk.ts, sessions.ts, test-expose)
SECURITY files — Path traversal validation on all file endpoints (list, read, write, delete, mkdir, move, search, diff, download-archive)
SECURITY quickchat — Bound array schemas: questions .max(20), options .max(20), steps .max(50)
CHORE    deps — Update hono 4.11.7->4.12.3 (timing fix), rollup 4.57.1->4.59.0 (path traversal CVE)

### 2026-02-24 · v0.30.0
FIX     container — Sync Dockerfile scripts with src/sandbox-scripts: add vfTools to src (create_plan/ask_user_questions), sync claude-agent.js (categorized errors, RAW_ERROR, exit(0) catch), sync ws-agent-server.js (6s timeout, reason fields, pause/resume, grace-period, system-info), add VF_CONTAINER_BUILD env; fix persist 400 on empty content; add useDiagnostics store + system-info event pipeline

### 2026-02-24 · v0.30.0
FIX     mobile — Eliminate iOS keyboard jank: remove position:fixed from html/body, use height:100dvh + flexbox h-full, strip viewportHeight from useKeyboard + 4 layout components, remove scroll-reset hacks

### 2026-02-24 · 988bccf · v0.30.0
FIX     streaming — Structured error diagnostics + auto-retry for transient crashes: categorized cleanErrorMessage (exit codes, auth, rate limit, overloaded), 6s context-file timeout with reason field on all exit paths, auto-retry once on context-timeout/child-exit, Retry button in MessageContent, reason forwarded through WS + SSE paths

### 2026-02-23 · v0.30.0
REFACTOR ui — Consolidate 3 tool renderers into UnifiedToolBlock; new tool-utils.ts + UnifiedToolBlock.tsx (6-state, icons, summaries, timer, CitationCard, SchemaViewer); wire commit/test-results/checkpoint-list/confirmation/persona part types; delete ToolCallBlock + ai-elements/Tool

### 2026-02-23 · v0.30.0
FIX     streaming — Pause/resume hardening: inner try/catch on SIGSTOP/SIGCONT, pause-failed/resume-failed error events, server confirmation handlers, pausedAt + 45s timeout toast, 6 unit tests

### 2026-02-23 · v0.30.0
FEAT    streaming — Agent pause/resume via SIGSTOP/SIGCONT through WS tunnel (ws-agent-server, api.ts, useSandbox, ChatPanel)

### 2026-02-21 · f098c96 · v0.29.0
FEAT    ui — useFocusTrap hook: Tab/Shift+Tab trap + Escape-to-close for all overlay panels
FEAT    ui — useSwipeTabs.ts: contentRef + live DOM transform swipe (no React re-renders per frame)
FEAT    ui — TabletLayout: Settings/Marketplace as fixed full-screen overlay (M7); Cmd+1/2/3 nav shortcuts (M8)
FIX     ui — MobileLayout: H8 edge-swipe-back (left-edge <20px swipe → goBack); TS2869 ?? precedence fix
FIX     ui — Suggestion.tsx: min-h-[44px] HIG touch target (was ~28px)
FIX     ui — SessionTabBar: 44px height, HIG-compliant overflow scroll; MobileTabBar: CSS token colors
FIX     ui — PromptInputSubmit: 44×44px min touch target (was 32px)
REFACTOR ui — remove scrollIntoView on keyboard open (causes iOS push-up bug)
CHORE   ui — delete dead MobileDrawer.tsx (no imports, only test comment reference)

### 2026-02-20 · 4553aca · v0.29.0
FIX     docker — ask_user_questions tool description: prescriptive (ALWAYS/NEVER), execute ack tells Claude to stop+wait; new container image d16f5f5d

### 2026-02-20 · v0.29.0 (patch)
FEAT    main-sessions — Dockerfile: vfTools object with create_plan + ask_user_questions in buildOptions()
FEAT    ui — MessageContent.tsx: tool-start intercepts create_plan → PlanCard, ask_user_questions → AskQuestionsBlock
FEAT    ui — AskQuestionsBlock wrapper reads sendMessage from useSandboxStore, threads to QuestionFlow.onSubmit
FEAT    ui — tool-result for create_plan/ask_user_questions suppressed (rendered on tool-start instead)
CHORE   docker — rebuilt container image fb6bb5c5 (Dockerfile changed)

### 2026-02-20 · v0.29.0
FEAT    container — claude-agent.js forwards system compacting events as {type:'system-status',status:'compacting'}
FEAT    sandbox — isCompacting boolean state in Zustand, reset on text/done/error
FEAT    ui — CompactionBanner in ChatPanel (amber, pulsing BrainCircuit icon, hides when text arrives)
FEAT    quickchat — create_plan tool: auto-executes, returns confirmation string, no needsApproval
FEAT    ui — PlanCard component: numbered steps, optional detail lines, estimatedSteps count
FEAT    ui — QuickChatMessage renders PlanCard for create_plan tool (output-available state)
CHORE   version — bump 0.28.0 → 0.29.0 (package.json + version.ts + CLAUDE.md)

### 2026-02-20 · 11117ee · v0.28.0
FEAT    quickchat — ask_user_questions tool: auto-executes, returns ack string, no needsApproval
FEAT    ui — QuestionFlow component: text/select/multiselect/confirm types, required validation, submitted receipt
FEAT    ui — QuickChatMessage renders QuestionFlow on ask_user_questions (input-available + output-available states)
CHORE   version — bump 0.27.0 → 0.28.0 (package.json + version.ts + CLAUDE.md)

### 2026-02-20 · 2c77c81 · v0.27.0
FEAT    ui — CitationCard: WebFetch results show always-visible card (favicon, title, domain, snippet)
FEAT    ui — Confirmation → ApprovalCard: destructive detection (rm/delete/drop → red theme + AlertTriangle)
FEAT    ui — ToolCallBlock: Globe icon for WebFetch, Search for Grep; URL formatted as hostname+path

### 2026-02-20 12:30 · eae501c · v0.27.0
FIX     sandbox — syncConfigFromContainer strips credential section before saving to KV
FIX     user-api — GET /user/claude-md returns empty instead of corrupt credential content

### 2026-02-20 04:18 · de304f8 · v0.27.0
FEAT    ws-agent — buffer stdout chunks to /tmp/vf-stream-{msgId}.jsonl per message
FEAT    sdk — new GET /api/sdk/replay/:sessionId endpoint for chunk-offset recovery
FEAT    streaming — frontend auto-replays missed chunks on unexpected WS close
FIX     streaming — wsChunkCount now excludes protocol frames (connected/heartbeat/ws-exit)

### 2026-02-25 · PENDING · v0.30.0
REFACTOR v15 — switch ChatSessionAgent from AIChatAgent to Agent base class; removes broken ai SDK dependency, drops unused WS bridge path (-287 lines), keeps HTTP NDJSON streaming only; fix preview wrangler config for self-hosted CHAT_SESSIONS DO

### 2026-02-25 · PENDING · v0.30.0
FIX     streaming — WS stability hardening: 25s ping keepalive (prevents CF/iOS idle connection kill during long thinks), 120s grace period on disconnect (was 30s, survives mobile app switches), reconnect-to-running-agent with JSONL buffer replay instead of killing; frontend ping/pong response + replay-complete event handling; Dockerfile synced

### 2026-02-26 · PENDING · v0.30.0
FEAT    settings — V1.5 HTTP Streaming toggle in Account > Experimental section; wires useV15 store flag to UI switch

### 2026-02-26 · PENDING · v0.30.0
FIX     v15 — Stability hardening: remove all v15-diag diagnostic emits (7 in claude-agent.js, 1 in chat-session-agent.ts, 1 handler in useSandbox.ts); fix betas warning for OAuth users (skip 1M context beta for sk-ant-oat tokens); thread mode/model/autonomy through V1.5 dispatchContainer (fixes /model and plan mode in V1.5); remove token prefix exposure from agency.ts logs
SECURITY agency — Replace token prefix logging with boolean hasToken check

### 2026-02-27 · PENDING · v0.30.0
FIX     ts — Resolve 7 TypeScript build errors: AI SDK v6 renames `parameters` -> `inputSchema` and `result.object` -> `result.output` (quickchat.ts x7, analyze.ts, commit-msg.ts); fix createModel arg order in user-components.ts; cast R2ListOptions for missing `include` field in files.ts; add sandboxManager to quickchat Variables type; bump JWT TTL 300s -> 360s for margin over bridge timeout
FIX     v15 — Prevent "Stream stopped" on cold container wake: DO emits connected event immediately on request receipt; container emits ping after CLI pre-flight; both reset frontend 5-min AbortController; bump container build to 20260227c
FIX     v15 — Container crash detection: capture Process from startProcess(); watchProcessCrash() races process.waitForExit() against bridge; non-zero exit or SSE error closes bridge immediately with error event instead of waiting 5-min timeout
FEAT    sentinel — Workspace keepalive: DO alarm pings sandbox every 8 min to prevent container idle eviction; ChatSessionAgent.alarm() writes /tmp/.vf-keepalive; sentinel started on session create/resume, stopped on sleep/delete; fixes product-breaking /workspace wipe on 10-min idle timeout
FEAT    sentinel — Always-on mode: 5th Activity button keeps Groq running continuously (5-min loop); sentinel-on/off WS commands; sentinelActive state + toggleSentinel action; skips start/stop on pause/resume when active; container build 20260227e
FEAT    groq-agent — Background code reviewer during pause: Groq llama-3.3-70b scans git diff + TODOs + recent files, writes /workspace/.vf-background-report.md; ws-agent-server injects report into next Claude prompt on resume; requires GROQ_API_KEY in user secrets; container build 20260227d
FEAT    sentinel — Manual flow: remove auto-inject, emit sentinel-data-ready WS event after scan; amber glow ring on Activity button when briefing ready; click sends briefing prompt to Claude (reads /workspace/.vf-sentinel-report.md); sentinelDataReady + sentinelDataSizeBytes state in Zustand; AccountTab consent checkbox (localStorage vf-sentinel-enabled)
FEAT    sentinel — Predictive co-pilot prompt: rewrite groq-background-agent with "What changed / Likely Next / Watch Out" structure; git diff HEAD~5 instead of raw file content; DeepSeek V3 support (DEEPSEEK_API_KEY priority over GROQ_API_KEY); report path renamed to .vf-sentinel-report.md; container build 20260227f

### 2026-02-27 · PENDING · v0.30.0
FIX     terminal — execStream first-byte timeout: 10s AbortController aborts on dead sandbox (no data received); cleared on first chunk so long-running commands are unaffected; "Command timed out — sandbox may be unavailable" shown in terminal; add signal param to sessionsApi.execStream

### 2026-02-27 · PENDING · v0.30.0
FIX     v15 — Forward costUsd in streamV15 done event mapping (cost meter now works for V1.5 sessions)
FIX     v15 — Await clearBuffer() in handleChatHttp to eliminate storeLine/delete race condition
FIX     v15 — Add reasoning-delta and error recovery to resumeV15 replay path (was only handling text-delta + done)
FIX     v15 — Guard resumeV15 and WS replay set() calls with session ID check; prevents recovered stream content bleeding into a different session when user switches tabs during async replay

### 2026-02-27 · PENDING · v0.30.0
FEAT    container — Auto-git autosave: ws-agent-server commits all /workspace changes to vf-autosave branch after every Claude response and before idle exit; force-push preserves only latest state; respects .gitignore; non-fatal if no remote; container build 20260227g

### 2026-02-28 · PENDING · v0.30.0
FIX     v15 — JWT TTL 360s→660s: bump DEFAULT_TTL_SECONDS to cover 10-min bridge timeout (comment and value were stale from 5-min era); container callbacks arriving after T+6min were getting 401 Unauthorized, closing bridge silently
FIX     v15 — CLAUDE_CONFIG_DIR: change /root/.config/claude → /root/.claude (standard Claude Code config path); wrong path caused heavy skills to silently fail — agents, session state, project config not found

### 2026-02-28 · PENDING · v0.30.0
FIX     v15 — DO heartbeat every 60s: ChatSessionAgent emits {"type":"heartbeat"} NDJSON line every 60s while stream is active; resets frontend 5-min AbortController during long tool-use sequences where container produces no output; frontend already handled heartbeat type (resetTimeout call); no container changes required
FIX     v15 — Heartbeat padding: pad DO heartbeat to >1KB (1024 whitespace bytes appended) so Chrome Fetch ReadableStream flushes chunk immediately; 21-byte heartbeat arrived at network layer but Chrome buffered it below reader.read() delivery threshold; also add resetTimeout() at top of every for-await iteration in useSandbox (defence-in-depth); fixes "Stream stopped" AbortError at exactly 300014ms on heavy skills
FIX     v15 — Bridge timeout: increase BRIDGE_TIMEOUT_MS from 5 to 10 minutes; cancel timeout immediately when container first connects to /internal/stream (handleContainerStream calls bridge.cancelBridgeTimeout()); add cancelBridgeTimeout field to HttpBridge; fixes "Container did not respond within 5 minutes" error on cold-start + heavy skills

### 2026-02-28 · PENDING · v0.30.0
FIX     plugins — SKILL.md-based skills injected into container with filename SKILL.md instead of <skill-name>.md; session init wipes /root/.claude/commands/ then repopulates, so Dockerfile embed was overwritten; fix: derive filename from parent dir name (plugins.ts x2, both fetchFileContent and buildItems paths); skills now land at /root/.claude/commands/claude-automation-recommender.md as expected

### 2026-02-28 · PENDING · v0.30.0
FIX     container — Remove tools: frontmatter from claude-automation-recommender skill (build 20260228b); tools field caused SDK tool mismatch — Read/Glob/Grep/Bash listed but not in custom tools registry, silently killed command execution

### 2026-02-28 · PENDING · v0.30.0
FIX     container — Embed /claude-automation-recommender skill in container image (build 20260228a); skill was absent from /root/.claude/commands/ so claude CLI exited silently producing empty response; embedded SKILL.md via heredoc since COPY is disabled on CF Sandboxes

### 2026-02-28 · PENDING · v0.30.0
FEAT    v15 — Graduate V1.5 HTTP streaming to default; flip useV15 from opt-in (=== '1') to opt-out (!== '0') so all users route through ChatSessionAgent DO by default; remove Experimental settings section from AccountTab; users who explicitly disabled V1.5 (localStorage vf_use_v15=0) stay on legacy WS
