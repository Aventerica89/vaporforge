# Developer Log

Technical log. Updated on every deploy.

<!-- Entries added automatically by deploy hook or /changelog dev -->

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
