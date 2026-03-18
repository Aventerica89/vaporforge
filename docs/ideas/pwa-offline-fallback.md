**Added:** 2026-03-18
**Status:** Idea
**Category:** PWA / UX

## Summary

Show a branded "You're offline" screen instead of the browser's default error page when the network is unavailable. Uses the `onOfflineReady` callback from vite-plugin-pwa.

## Details

- SW already handles network failures with a 408 response
- Replace with a proper offline fallback page that matches VaporForge branding
- Could show last-known session state or a "Reconnecting..." animation
- Workbox supports `offlineFallback` in NavigationRoute

## Next Steps

- Create `ui/public/offline.html` with VaporForge branding
- Add offline fallback to SW navigation handler
- Test by toggling airplane mode on iOS PWA
