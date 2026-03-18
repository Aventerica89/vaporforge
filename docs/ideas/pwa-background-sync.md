**Added:** 2026-03-18
**Status:** Idea
**Category:** PWA / Infrastructure

## Summary

Queue chat messages sent while offline and deliver them when connection returns, using Workbox BackgroundSync plugin.

## Details

- Workbox provides `BackgroundSyncPlugin` for retry-on-reconnect
- Could apply to QuickChat messages and potentially main chat
- SW already skips `/api/` routes — would need selective interception for chat endpoints
- Risk: stale messages sent after reconnect could confuse conversation state
- May be better suited for non-chat actions (favorites, settings saves)

## Next Steps

- Evaluate which API calls benefit most from background sync
- Start with simple non-chat mutations (favorites, settings)
- Add Workbox BackgroundSync to SW for those routes
- Test with airplane mode toggle
