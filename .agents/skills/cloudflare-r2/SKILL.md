---
name: cloudflare-r2
description: Official Cloudflare R2 object storage documentation. Reference when working with VaporFiles, r2.put(), r2.get(), r2.list(), r2.delete(), custom metadata, R2 binding configuration, or file upload/download in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge uses R2 for VaporFiles — file storage attached to chat sessions and user workspaces. Files are uploaded via the API, stored in R2, and surfaced to the Claude CLI subprocess inside containers.

Key VaporForge files related to R2:
- `src/api/files.ts` — R2 put/get/list/delete operations
- `src/api/chat.ts` — File attachment to sessions
- `wrangler.toml` — R2 bucket binding definition (`r2_buckets` block)

## Critical Gotchas (VF-Specific)

1. **`list()` omits custom metadata by default** — Must pass `include: ['customMetadata']` to get metadata in list results: `r2.list({ include: ['customMetadata'] })`. Without this, `customMetadata` is undefined on all listed objects.

2. **Cursor pagination for large buckets** — `list()` returns at most 1000 objects per call. Use the returned `cursor` for pagination: `r2.list({ cursor: result.cursor })` until `result.truncated === false`.

3. **No server-side sorting** — R2 `list()` returns objects in lexicographic key order. To sort by upload date or size, sort client-side after listing.

4. **`put()` with custom metadata** — Store file metadata (originalName, mimeType, sessionId, userId) at upload time: `r2.put(key, body, { customMetadata: { originalName, sessionId } })`. This avoids needing a separate KV lookup.

5. **R2 binding in `Env` interface** — The R2 bucket must be declared in the `Env` interface in `src/types.ts` as `R2Bucket`. Missing declaration causes TypeScript errors on `env.VAPOR_FILES`.

6. **`get()` returns `null` for missing objects** — Always null-check before streaming an R2 response. Return 404 explicitly rather than crashing on `null.body`.

7. **No native CDN** — R2 objects are not publicly accessible by default. Serve files through a Worker route or use R2 public bucket + custom domain for static assets.

8. **`compatibility_date` affects multipart** — Multipart upload behavior changed in recent compatibility dates. Check `wrangler.toml` if large uploads are failing.

## Full Documentation

See `references/docs.md` for the complete Cloudflare R2 documentation.

Source: `https://developers.cloudflare.com/r2/llms-full.txt`
