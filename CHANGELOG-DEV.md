# Developer Log

Technical log. Updated on every deploy.

<!-- Entries added automatically by deploy hook or /changelog dev -->

### 2026-02-20 12:30 · eae501c · v0.27.0
FIX     sandbox — syncConfigFromContainer strips credential section before saving to KV
FIX     user-api — GET /user/claude-md returns empty instead of corrupt credential content

### 2026-02-20 04:18 · de304f8 · v0.27.0
FEAT    ws-agent — buffer stdout chunks to /tmp/vf-stream-{msgId}.jsonl per message
FEAT    sdk — new GET /api/sdk/replay/:sessionId endpoint for chunk-offset recovery
FEAT    streaming — frontend auto-replays missed chunks on unexpected WS close
FIX     streaming — wsChunkCount now excludes protocol frames (connected/heartbeat/ws-exit)
