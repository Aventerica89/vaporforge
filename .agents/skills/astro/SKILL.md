---
name: astro
description: Official Astro framework documentation. Reference when working with the VaporForge landing page, Astro components, frontmatter, is:inline scripts, view transitions, Agency mode site injection, or Astro 5 features in VaporForge.
user-invocable: false
---

## VaporForge-Specific Context

VaporForge has two Astro surfaces:

1. **Landing page** (`landing/` directory) — Built with Astro 5, deployed as part of the main Worker via `build:landing` → `build:merge`. The landing page is a static site (SSG) bundled into the Worker's `dist/` output.
2. **Agency mode** — VF injects into customer Astro sites. When a customer site uses Astro, VF's Agency mode must handle Astro's component model and build pipeline via Astro's integration API — not by modifying Astro internals directly.

Key VF files related to Astro:
- `landing/` — Astro 5 landing page source
- `landing/src/pages/` — Astro page routes
- `landing/src/components/` — Astro components
- `scripts/build-landing.js` — Landing build script (runs `astro build`)
- `wrangler.toml` — `build:merge` combines landing output with Worker dist

## Critical Gotchas (VF-Specific)

1. **`is:inline` prevents bundling** — Scripts tagged `<script is:inline>` are emitted as-is without Astro processing. Use for scripts that depend on global variables, third-party embeds, or need to run before Astro's module graph loads. Do not use for scripts that import modules.

2. **Frontmatter is server-only** — Code in Astro component frontmatter (between `---`) runs at build time on the server, never in the browser. Don't put browser APIs (`window`, `document`, `localStorage`) there.

3. **`build:ui` alone is insufficient** — Never run `build:ui` alone. VF's build pipeline is `npm run build` which runs `build:info + build:landing + build:ui + build:merge`. Running only `build:ui` leaves the landing page stale in `dist/`.

4. **View transitions require `<ViewTransitions />`** — Astro 4+ view transitions need the `<ViewTransitions />` component in the layout's `<head>`. Transitions silently do nothing without it.

5. **Astro 5 content collections** — Astro 5 changed the content collections API. Use `getCollection()` from `astro:content`, not the legacy `Astro.glob()` pattern. The legacy pattern still works but is deprecated.

6. **Agency mode injection** — When VF injects into a customer Astro site, it hooks into the Astro build via the integration API. Modifying Astro component internals directly will break during the customer's build. Use the integration `injectScript` / `injectRoute` hooks instead.

7. **SSR vs SSG** — VF landing page uses SSG (static output). Agency-injected components may need to handle both modes depending on customer config. Check `output` in the customer's `astro.config.*` before assuming static.

## Full Documentation

See `references/docs.md` for the complete Astro documentation.

Source: `https://docs.astro.build/llms-full.txt`
