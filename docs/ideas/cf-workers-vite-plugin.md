**Added:** 2026-03-18
**Status:** Idea
**Category:** Infrastructure / DX

## Summary

Replace the two-server dev setup (wrangler dev + Vite dev) with Cloudflare's official Workers Vite plugin. One dev server, Worker code runs in workerd with real bindings, HMR for everything.

## Details

- Docs: https://developers.cloudflare.com/workers/vite-plugin/
- Currently: `npm run dev` (wrangler, port 8787) + `npm run dev:ui` (Vite, port 3000 with proxy)
- With plugin: single Vite dev server runs Worker in workerd + serves SPA
- Real KV, DO, R2 bindings in dev (no mocking or proxying)
- Supports SPAs with backend APIs — matches VaporForge's pattern
- Framework support for React Router, TanStack Start (we're plain React/Hono)

## Risks

- VaporForge has an unusual architecture: Hono Worker + separate Vite SPA + Astro landing + containers
- The build:merge pipeline may conflict with the plugin's asset handling
- Hono compatibility with the plugin needs investigation
- Container/sandbox orchestration may not work in local workerd
- Non-trivial migration — needs a research spike first

## Next Steps

- Research spike: can the plugin coexist with vite-plugin-pwa?
- Test with a minimal Hono Worker + React SPA to validate the pattern
- Check if wrangler.jsonc bindings (DOs, KV, R2, Containers) work through the plugin
- Evaluate impact on the build:merge pipeline
