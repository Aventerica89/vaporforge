---
name: container-debug
description: Diagnostic workflow for sandbox session failures. Checks session state, sandbox health, auth tokens, V1.5 bridge, and container logs.
---

# /container-debug — Sandbox Session Diagnostics

Run this when a user reports sandbox session failures (chat not responding, stream errors, container crashes).

## Arguments

Parse `$ARGUMENTS`:
- No args — full diagnostic on the most recent active session
- `<sessionId>` — diagnose a specific session
- `--v15` — focus on V1.5 HTTP streaming path
- `--auth` — focus on auth/token issues

## Step 1: Identify the Session

If no sessionId provided, find the most recent:

```bash
# Check localStorage for active session
# Or grep recent logs
```

Read the session from KV:
```
GET session:{sessionId} from SESSIONS_KV
```

Report:
- `sessionId`, `sandboxId`, `status`, `lastActiveAt`
- `createdAt` vs now (session age)
- Whether session is `active`, `sleeping`, `terminated`, or `pending-delete`

## Step 2: Check Auth Token

Read user record from AUTH_KV:
```
GET user:{userId} from AUTH_KV
```

Verify:
- `claudeToken` field exists inside the user JSON object
- Token starts with `sk-ant-oat01-` (OAuth) or `sk-ant-api01-` (API key)
- If missing: "No Claude token — user needs to re-authenticate via setup-token"
- If wrong prefix: "Invalid token format — expected sk-ant-oat01-* for sandbox sessions"

Check token freshness:
- Read `tokenRefreshedAt` if present
- If >23 hours old, flag: "Token may need refresh — last refreshed {time} ago"

## Step 3: Check Sandbox State

Using the `sandboxId` from session:

1. **Sandbox existence**: Does `getSandbox(SANDBOX_CONTAINER, sandboxId)` return?
2. **Health check**: Try reading a file like `/tmp/vf-pending-query.json` or `/workspace`
3. **Container status**: Is it running, sleeping, or terminated?

Common failure modes:
- `sandboxId` is empty/null → session was created but sandbox never provisioned
- Sandbox returns 404 → container was recycled (15-min idle timeout)
- Sandbox returns but operations timeout → container is in a bad state

## Step 4: V1.5 Diagnostics (if --v15 or V1.5 enabled)

Check the ChatSessionAgent DO:

1. **DO state**: Read `userId` and `sdkSessionId` from DO storage
2. **Bridge state**: Are there active httpBridges? (can't directly read, but check for stuck streams)
3. **Route check**: Verify `/api/v15/chat` route is registered in `src/index.ts`
4. **JWT**: Check that `JWT_SECRET` env var is bound

Common V1.5 failures:
- "No userId available" → `/init` was never called AND POST body didn't include userId
- "No Claude token found" → AUTH_KV lookup failed (wrong key format or missing user record)
- "Container did not respond within 5 minutes" → Bridge timeout hit, container never called back
- "No active stream for this execution" → Container called back with wrong executionId or bridge already cleaned up

## Step 5: Container Environment Check

If sandbox is reachable, verify critical env vars would be set:

```
Required in startProcess env (V1.5):
  PATH=/usr/local/bin:/usr/bin:/bin
  HOME=/root
  NODE_PATH=/usr/local/lib/node_modules
  IS_SANDBOX=1
  CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-*
  VF_CALLBACK_URL=https://vaporforge.dev/internal/stream
  VF_STREAM_JWT=<token>
  CLAUDE_CONFIG_DIR=/root/.config/claude

Required in container env (WS path):
  IS_SANDBOX=1
  All of process.env spread first
```

Flag any that would be missing based on current code/config.

## Step 6: Recent Errors

Check Worker logs (if available via wrangler tail) for:
- `[ChatSessionAgent]` prefixed messages
- `stream pipe error`
- `handleChatHttp error`
- `dispatchContainer` errors
- JWT verification failures

## Step 7: Report

Output a structured diagnostic:

```
Session Diagnostic Report
─────────────────────────

Session: {id} ({status})
Sandbox: {sandboxId} ({running/sleeping/gone})
User:    {userId} (token: {valid/missing/expired})
Path:    {WS default / V1.5 HTTP}
Age:     {created X hours ago}

Checks:
  [PASS] Session exists in KV
  [PASS] Auth token valid (sk-ant-oat01-*)
  [FAIL] Sandbox not reachable (likely recycled)
  [PASS] V1.5 DO initialized
  [WARN] Token refreshed 22h ago

Diagnosis: Container was recycled after 15-min idle timeout.
Fix: Resume session (creates new sandbox) or start new session.

Suggested action: POST /api/sessions/{id}/resume
```

## Common Fixes Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Chat not responding" | Container sleeping/recycled | Resume session |
| "Stream error" (V1.5) | Bridge timeout or JWT expired | Retry chat |
| "Please re-authenticate" | Token missing from AUTH_KV | Run setup-token again |
| "Session terminated" | User or system terminated | Create new session |
| "Sandbox failed to wake" | Container in bad state | Delete + recreate session |
| Stream hangs indefinitely | Container process crashed | Check if claude-agent.js exited |
