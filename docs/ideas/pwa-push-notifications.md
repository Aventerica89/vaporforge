**Added:** 2026-03-18
**Status:** Idea
**Category:** PWA / Infrastructure

## Summary

Send push notifications for long-running events: "Sandbox session ready", "Build complete", "Agent finished task". Uses Web Push API with VAPID keys.

## Details

- Requires backend: generate VAPID keys, store push subscriptions in KV
- Frontend: request notification permission, subscribe to push, handle incoming
- Useful for walk-away scenarios where user starts a sandbox and switches apps
- ChatSessionAgent DO already knows when processes complete — ideal trigger point
- iOS 16.4+ supports Web Push for PWAs (our target)

## Next Steps

- Generate VAPID key pair, store in 1Password
- Add push subscription endpoint to Worker
- Store subscriptions in AUTH_KV per user
- Add `push` event handler to SW
- Trigger from ChatSessionAgent when process completes
