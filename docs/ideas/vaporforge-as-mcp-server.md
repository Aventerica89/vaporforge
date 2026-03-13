**Added:** 2026-03-13
**Status:** Idea
**Category:** VaporForge / MCP / Ecosystem

## Summary

Expose VaporForge itself as an MCP server so any MCP-capable client (VibeSDK, Claude Desktop, Cursor, Windsurf, etc.) can use VF's sandbox capabilities as tools. Flip side of MCP OAuth work — instead of VF consuming MCP servers, VF becomes one.

## Why

- VF's sandbox (persistent container, Claude CLI, file system, terminal) is uniquely powerful
- Any AI tool with MCP support gets VF's capabilities for free
- VibeSDK generates an app → calls VF's run_in_sandbox tool → live output
- Claude Desktop users get VF sessions without the web UI
- Monetization: MCP access could be a paid tier

## Tools VF Could Expose

- `create_session` — spin up a sandbox session
- `send_message` — send a prompt to an active session, stream response
- `run_command` — execute a shell command in the container
- `read_file` / `write_file` — filesystem access
- `list_sessions` — active sessions for this user
- `get_session_history` — retrieve chat history

## Integration with VibeSDK Specifically

VibeSDK (build.cloudflare.dev) builds and deploys apps via AI. If VF is an MCP server:
- VibeSDK agent calls `create_session` → gets a VF sandbox
- Agent calls `run_command` to test generated code in a real environment
- Real execution results feed back into VibeSDK's generation loop
- VF provides the "real computer" that VibeSDK's generated apps need

## Implementation Sketch

1. New Worker route: `POST /mcp` (HTTP MCP transport, per 2025-11-05 spec)
2. Auth: Bearer token = VF session JWT (user must be logged in)
3. JSON-RPC handler: `tools/list`, `tools/call`
4. Expose tools above as JSON-RPC methods
5. Register VF as MCP server in Claude Desktop / VibeSDK settings

## Related

- `docs/ideas/mcp-oauth-worker-as-client.md` — VF consuming MCP servers (the other direction)
- MCP spec 2025-11-25: HTTP transport with Bearer auth is exactly what's needed
