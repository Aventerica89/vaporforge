# Sandbox API Improvements — Learnings from Moltworker/OpenClaw

**Added:** 2026-03-11
**Status:** Idea
**Category:** VaporForge / Infrastructure
**Priority:** P2
**Source:** https://github.com/cloudflare/moltworker

## Summary

Official Cloudflare project (moltworker) runs an AI assistant (OpenClaw, formerly Moltbot) on
CF Sandboxes. Code review revealed several Sandbox API patterns VaporForge does not use yet.

## Patterns to Adopt

### `containerFetch(request, port)` — HTTP proxy
Simple reverse-proxy to the container's HTTP port. Good for health checks and short-lived
request/response flows without WS overhead. Our V1.5 JWT-callback pattern is still better
for long-running streams, but this is cleaner for status queries or one-shot container calls.

### `listProcesses()` — check before starting
They check for existing processes before calling `startProcess`. Enables container reuse and
crash detection. We fire `startProcess` unconditionally — this could prevent double-starts
and help with lifecycle management.

Pattern: list processes, find one matching your script name with status `running` or
`starting`, reuse it. Only start fresh if none found.

### `process.waitForPort(port, { mode: 'tcp', timeout })` — readiness gate
Wait for the actual TCP port to be reachable before proxying. Cleaner health gating than
relying on WS server start success. They use a single startup timeout constant for both
existing and new processes to avoid race conditions.

### `getSandbox()` with `sleepAfter` — cost optimization tier
They expose `sleepAfter` as configurable (`'10m'`, `'1h'`, `'never'`). We only use
`keepAlive: true`. A per-session idle timeout could be a configurable or Pro feature in VF.

### Cold-start loading page via `waitUntil`
Instead of making users stare at a spinner waiting for container startup, serve an HTML
loading page immediately while the container starts in the background via
`c.executionCtx.waitUntil(...)`. We have no cold-start UX — this would significantly improve
perceived performance for new or cold sessions.

### In-container rclone sync for R2
Instead of Worker-side R2 operations (subject to payload size limits), install `rclone` in
the container and sync files directly to R2 via the S3-compatible API from inside the
container. Background loop runs every 30s watching for file changes via `find -newer`.

Relevant to VaporForge's `FILES_BUCKET` and large file operations that hit our
`writeFile()` payload size limits (~500KB).

### `sandbox.exec()` for one-shot commands
Moltworker uses `sandbox.exec()` for quick checks (file existence, flag files, config
detection). We use `startProcess` for everything. `exec()` is better for lightweight
operations — returns stdout/stderr/success without the process lifecycle overhead.

### `standard-1` instance type — cheaper tier option
They use `standard-1` (1 vCPU, 4 GiB). We use `standard-3` (2 vCPU, 8 GiB). A smaller
instance type could be an option for light users or read-only sessions.

## Priority

| Pattern | Impact | Effort |
|---------|--------|--------|
| Cold-start loading page | High — UX improvement visible to all users | Low |
| `listProcesses` check | High — prevents double-starts, aids crash recovery | Low |
| `sleepAfter` option | High — cost reduction for idle sessions | Medium |
| `waitForPort` readiness | Medium — more reliable proxy startup | Low |
| `containerFetch` | Medium — cleaner for non-streaming flows | Low |
| rclone in-container sync | Medium — unblocks large file ops | High |
| `standard-1` tier | Low — billing/settings work needed | High |
