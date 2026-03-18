**Added:** 2026-03-18
**Status:** Idea
**Category:** PWA / Polish

## Summary

Generate iOS splash screens using `@vite-pwa/assets-generator` so the PWA shows a branded VaporForge launch screen instead of a blank white/black flash when opened from the home screen.

## Details

- `@vite-pwa/assets-generator` can auto-generate all Apple splash screen sizes from a single SVG
- Supports dark mode splash screens (`darkResizeOptions`)
- Source image: `ui/public/icon.svg` (already exists)
- Background: `#0f1419` (dark theme) / `#1dd3e6` (accent) for dark mode
- Config goes in `pwa-assets.config.ts` at ui/ root
- Docs: https://vite-pwa-org.netlify.app/assets-generator/cli.html

## Next Steps

- `npm install @vite-pwa/assets-generator -D`
- Create `ui/pwa-assets.config.ts` with `minimal2023Preset` + `createAppleSplashScreens`
- Run `pwa-assets-generator` to generate all icons and splash screens
- Add generated HTML head links to index.html or let plugin inject them
