---
name: cloudflare-kv
description: Official Cloudflare KV documentation. Reference when working with AUTH_KV, SESSIONS_KV, kv.get(), kv.put(), kv.list(), kv.delete(), KV metadata, expiration/TTL, or KV binding configuration in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge uses two KV namespaces:
- `AUTH_KV` — Stores OAuth tokens, API keys, and authentication state keyed by user ID
- `SESSIONS_KV` — Stores active session metadata keyed by session ID

Key VaporForge files related to KV:
- `src/api/auth.ts` — AUTH_KV reads/writes
- `src/api/chat.ts` — SESSIONS_KV reads/writes
- `wrangler.toml` — KV namespace binding definitions (`kv_namespaces` block)

Each KV namespace must be declared in the `Env` interface in `src/types.ts` as `KVNamespace`. Example:

```typescript
interface Env {
  AUTH_KV: KVNamespace;
  SESSIONS_KV: KVNamespace;
}
```

And in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "AUTH_KV"
id = "<namespace-id>"

[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "<namespace-id>"
```

## Critical Gotchas (VF-Specific)

1. **`list()` returns keys only by default** — To get values alongside keys, store serialized data in the `metadata` field at write time: `kv.put(key, value, { metadata: { userId, createdAt } })`. Retrieving metadata is free; getting the value requires a separate `get()` call per key.

2. **No transactions** — KV is eventually consistent. Two writes to the same key in rapid succession may result in either value being stored. Design around this: use unique keys, not read-modify-write patterns.

3. **`expirationTtl` for session cleanup** — Always set `expirationTtl` (seconds) on session keys in SESSIONS_KV to prevent unbounded growth. Auth tokens should also expire.

4. **`list()` pagination via cursor** — `list()` returns at most 1000 keys per call. For large namespaces, use the returned `cursor` to paginate: `kv.list({ cursor: result.cursor })` until `result.list_complete === true`.

5. **KV binding in `Env` interface** — Each KV namespace must be declared in the `Env` interface in `src/types.ts` as `KVNamespace`. Missing declaration causes TypeScript errors on `env.AUTH_KV`.

6. **`get()` returns `null` for missing keys** — Always null-check before using KV values. Never assume a key exists.

7. **Write propagation delay** — KV writes may take up to 60 seconds to propagate globally. For auth state that needs immediate consistency, consider writing + reading in the same region first.

## Full Documentation

See `references/docs.md` for the complete Cloudflare KV documentation.

Source: `https://developers.cloudflare.com/kv/llms-full.txt`
