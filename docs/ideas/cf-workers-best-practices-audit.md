**Added:** 2026-03-18
**Status:** Idea
**Category:** Security / Performance

## Summary

Audit VaporForge Worker against CF best practices. Key risks: module-level state leaks, timing-unsafe secret comparison, floating promises, hand-written Env types.

## Details

- Docs: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Workers reuse isolates across requests — module-level `let` variables leak between users
- `===` for secret comparison is timing-attackable — use `crypto.subtle.timingSafeEqual()`
- Unawaited promises not in `ctx.waitUntil()` silently fail
- `wrangler types` can auto-generate Env interface from wrangler.jsonc bindings

## Audit Checklist

- [ ] Grep for module-level `let`/`var` in `src/index.ts` and route handlers (NOT in DOs — those are per-instance)
- [ ] Grep for `===` comparisons involving tokens, JWTs, secrets — replace with timing-safe
- [ ] Grep for unawaited async calls not in `waitUntil()` — enable `no-floating-promises` lint rule
- [ ] Run `wrangler types` and compare with hand-written Env interface
- [ ] Check if `passThroughOnException()` is used anywhere
- [ ] Verify streaming patterns (no `await response.text()` on large payloads)

## Already Good

- Streaming via WS bridge (not buffering)
- Using bindings (KV, DOs, R2, Containers) not REST APIs
- Secrets via `wrangler secret`, not in config
- DOs + WebSocket for persistent connections

## Next Steps

- Run the audit checklist in a dedicated session
- Fix any findings
- Add `no-floating-promises` ESLint rule
