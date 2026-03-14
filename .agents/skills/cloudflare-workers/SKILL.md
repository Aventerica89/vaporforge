---
name: cloudflare-workers
description: Official Cloudflare Workers runtime documentation. Reference when working with Workers bindings, env bindings, compatibility_date, wrangler.toml, waitUntil, fetch sub-request limits, or Workers-specific runtime behavior in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge's entire backend is a Cloudflare Worker (`src/worker.ts` + `src/api/*.ts`). The Worker handles API routes via Hono, manages KV/R2/Container/DO bindings, and orchestrates chat sessions through the ChatSessionAgent DO.

Key VaporForge files related to Workers:
- `src/worker.ts` — Worker entrypoint, global fetch handler
- `wrangler.toml` — All bindings (KV, R2, Containers, DO, env vars)
- `src/api/*.ts` — Hono route handlers (33+ files)

## Critical Gotchas (VF-Specific)

1. **Workers is NOT Node.js** — No `fs`, `child_process`, `Buffer` (use `Uint8Array`), `process.env` (use `env` binding). Assuming Node.js APIs causes silent failures.
2. **`env` binding, not `process.env`** — All environment variables are passed as the `env` parameter to the `fetch()` handler. Access as `env.MY_VAR`, never `process.env.MY_VAR`.
3. **`setTimeout` returns `number`** — Not `NodeJS.Timeout`. TypeScript will complain if you use `clearTimeout(NodeJS.Timeout)`. Store as `number` or `ReturnType<typeof setTimeout>`.
4. **`fetch()` sub-request limits** — Maximum 50 outbound fetch calls per request. Design API routes to stay well under this limit.
5. **`waitUntil` for background work** — To do work after returning a response, use `ctx.waitUntil(promise)`. Don't fire-and-forget without it — the Worker may be torn down.
6. **`compatibility_date` matters** — Certain APIs and behaviors are gated by the date in `wrangler.toml`. If a Worker API isn't behaving as documented, check compatibility flags.
7. **Bindings are typed via `Env` interface** — All KV, R2, DO, Container bindings must be declared in the `Env` interface in `src/types.ts`. Missing binding declarations cause TypeScript errors.

## Full Documentation

See `references/docs.md` for the complete Cloudflare Workers runtime documentation.

Source: `https://developers.cloudflare.com/workers/llms-full.txt`
