---
name: cloudflare-sandbox
description: Official Cloudflare Sandbox SDK documentation. Reference when working with @cloudflare/sandbox, exec(), writeFile(), wsConnect(), exposePort(), gitCheckout(), or any sandbox.ts operations in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge uses the Cloudflare Sandbox SDK (`@cloudflare/sandbox`) extensively in `src/sandbox.ts`. The sandbox wraps a Cloudflare Container and provides a higher-level API for file operations, process execution, WebSocket connections, and port management. Key VF file: `src/sandbox.ts` — contains 30+ sandbox API calls.

## API Quick Reference

Core sandbox methods used in VF:

- `sandbox.exec(cmd, args, options)` — Run a command synchronously, returns stdout/stderr after completion. Does NOT stream.
- `sandbox.execStream(cmd, args, options)` — BROKEN for streaming due to RPC buffering. Output only arrives after process exits. Avoid for real-time use cases.
- `sandbox.wsConnect(request, port)` — WebSocket connection to a process running inside the sandbox on the given port. This IS the correct way to stream real-time output.
- `sandbox.writeFile(path, content)` — Write a file inside the sandbox filesystem.
- `sandbox.readFile(path)` — Read a file from the sandbox filesystem.
- `sandbox.exposePort(port)` — Expose a port from the sandbox. Must be called BEFORE the process binds to that port.
- `sandbox.gitCheckout(repo, options)` — Clone a git repository into the sandbox.
- `sandbox.startProcess(cmd, args, env, options)` — Start a long-running process. The env parameter REPLACES container defaults entirely.

## Critical Gotchas (VF-Specific)

1. **execStream is not a streaming API** — Despite the name, execStream buffers all output internally due to Cloudflare RPC constraints. The response only arrives once the process exits. Use wsConnect instead.

2. **env in startProcess replaces defaults** — The env object completely replaces (not merges with) the container's default environment. Always include: `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`, `HOME=/root`, `NODE_PATH`, `LANG=en_US.UTF-8`, `TERM=xterm-256color`.

3. **exposePort timing** — Call `exposePort` before the process inside starts listening. If the port is already bound when you call `exposePort`, behavior is undefined.

4. **Sandbox binding in wrangler.toml** — The sandbox is accessed via a binding (typically `env.SANDBOX`) configured in `wrangler.toml`. Changes to sandbox binding config require re-deployment.

## Full Documentation

See `references/docs.md` for the complete Cloudflare Sandbox SDK documentation.

Source: `https://developers.cloudflare.com/sandbox/llms-full.txt` (fetched 2026-03-14, ~449KB, 16008 lines)
