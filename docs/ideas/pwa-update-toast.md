**Added:** 2026-03-18
**Status:** Idea
**Category:** PWA / UX

## Summary

Show a toast notification when a new version of VaporForge is deployed, prompting the user to reload. Uses the `onNeedRefresh` callback from vite-plugin-pwa's `registerSW`.

## Details

- vite-plugin-pwa is already installed with `registerType: 'autoUpdate'`
- `registerSW` returns `onNeedRefresh` and `onOfflineReady` callbacks
- Wire `onNeedRefresh` to show a toast: "Update available — tap to refresh"
- Use existing `toast()` utility for the notification
- On tap, call `updateSW(true)` to activate the new SW and reload

## Next Steps

- Update `ui/src/main.tsx` to capture `onNeedRefresh` from `registerSW`
- Create a small React component or use existing toast system
- Test by deploying twice and verifying the toast appears on the second load
