# Developer Log

Technical log. Updated on every deploy.

<!-- Entries added automatically by deploy hook or /changelog dev -->

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
