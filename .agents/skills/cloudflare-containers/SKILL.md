---
name: cloudflare-containers
description: Official Cloudflare Containers documentation. Reference when working with CF Containers, startProcess, container lifecycle, image deployment, port exposure, or environment variables in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge uses Cloudflare Containers as its primary sandbox runtime. The `ChatSessionAgent` (a Durable Object) starts containers via `startProcess` to run Claude CLI sessions. Each chat session maps to a container instance that runs the Claude CLI subprocess inside a controlled Linux environment.

Key VaporForge files related to containers:
- `sandbox.ts` — container binding, `startProcess` calls, port/env configuration
- `src/api/chat.ts` — session lifecycle, wires ChatSessionAgent to incoming requests
- `wrangler.toml` — container binding definition, `VF_CONTAINER_BUILD` version bump trigger

## Critical Gotchas (VF-Specific)

1. **env REPLACES container defaults** — The `env` object passed to `startProcess` completely replaces the container's default environment. Always include `PATH`, `HOME`, `NODE_PATH`, `LANG`, `TERM`, or the Claude CLI subprocess will fail silently. This is the #1 source of broken sessions.

2. **execStream() cannot stream** — RPC buffering holds all output until the process exits. Never use `execStream()` for real-time output. Use `sandbox.wsConnect(request, port)` for streaming or `startProcess` + HTTP callback.

3. **Image push deduplication** — CF Containers deduplicates image layers. If the image hasn't changed, pushing skips the upload. Don't mistake a fast push for a failed push.

4. **Port exposure timing** — `exposePort()` must be called before the process inside the container binds to that port. Race conditions here cause "connection refused" errors.

5. **Container cold start** — First `startProcess` after a period of inactivity has a cold start delay. Build this into timeout expectations.

6. **VF_CONTAINER_BUILD bump** — When changing `sandbox-scripts/*.js`, always bump `VF_CONTAINER_BUILD` in `wrangler.toml` AND update the corresponding `COPY` in the Dockerfile.

## Full Documentation

See `references/docs.md` for the complete Cloudflare Containers documentation.

Source: `https://developers.cloudflare.com/containers/llms-full.txt`
