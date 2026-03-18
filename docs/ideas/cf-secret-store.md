**Added:** 2026-03-18
**Status:** Idea
**Category:** Infrastructure / Security

## Summary

Use Cloudflare Secret Store for sensitive credentials instead of storing them in KV. Dedicated secrets manager with proper access controls, separate from application data.

## Details

- Docs: https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/
- `wrangler secrets-store store create` / `wrangler secrets-store secret create`
- Bindings in wrangler.jsonc: `secrets_store_secrets` with store ID + secret name
- Async access — must resolve at container start time, not in class defaults
- Better security posture than KV for tokens, API keys, R2 credentials

## Use Cases for VaporForge

1. R2 API credentials for FUSE mount (instead of env vars)
2. User OAuth tokens (currently in AUTH_KV — could move sensitive fields)
3. MCP server credentials (database passwords, API keys)
4. Any credential that shouldn't live alongside application data in KV

## Next Steps

- Evaluate migration path from KV-stored tokens to Secret Store
- Check if Secret Store supports per-user scoping or if it's per-Worker
- Test async binding resolution in startProcess flow
