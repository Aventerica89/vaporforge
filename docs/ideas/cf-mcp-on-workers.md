**Added:** 2026-03-18
**Status:** Idea
**Category:** MCP / Architecture

## Summary

Replace VaporForge's custom MCP OAuth implementation with CF's built-in MCP framework. Deploy MCP servers as Workers (instant, edge) instead of running them in containers. Use `DurableObjectOAuthClientProvider` for OAuth state management.

## Details

### CF MCP Server Framework
- Docs: https://developers.cloudflare.com/agents/guides/remote-mcp-server/
- Three tiers: `createMcpHandler()` (stateless), `McpAgent` (stateful DO), raw transport
- Built-in `OAuthProvider` handles `/authorize`, `/token`, `/register`, `/callback`
- KV stores OAuth tokens automatically
- Streamable HTTP transport (current MCP spec standard)

### CF MCP Client OAuth
- Docs: https://developers.cloudflare.com/agents/guides/oauth-mcp-client/
- `addMcpServer(url)` → returns `authUrl` if OAuth needed
- `DurableObjectOAuthClientProvider` manages nonce, server ID, token lifecycle
- States: `authenticating` → `connecting` → `ready` (or `failed`)
- React integration: `useAgent` hook with `onMcpUpdate` for real-time state

### Human-in-the-Loop
- Docs: https://developers.cloudflare.com/agents/guides/human-in-the-loop/
- `waitForApproval()` pauses workflows for user decisions (hours/days)
- MCP Elicitation: servers request structured user input via JSON Schema mid-tool
- React: `state.pendingApprovals` renders approval UI
- SQL audit trail for all decisions

## Hybrid Architecture: Workers for Protocol, Containers for Compute

| MCP Server Type | Runtime | Why |
|---|---|---|
| API wrappers (GitHub, Slack, Notion) | Worker | Just HTTP calls, instant startup |
| Database (Postgres, MySQL) | Worker + Hyperdrive | Connection pooling |
| Filesystem-dependent (git, local files) | Container | Needs real filesystem |
| Heavy compute (code execution) | Container | Needs Node.js/native deps |

## What This Replaces in VaporForge

- Custom MCP OAuth flow (`src/mcp-oauth.ts`) → `DurableObjectOAuthClientProvider`
- Manual probe discovery (RFC 9728/8414) → CF framework handles it
- Custom token storage in KV → framework-managed KV
- Custom callback routing → `OAuthProvider` handles `/callback`
- `ask_user_questions` custom tool → MCP Elicitation (JSON Schema forms)

### CF MCP Client Connection
- Docs: https://developers.cloudflare.com/agents/guides/connect-mcp-client/
- `this.addMcpServer(name, serverUrl)` → returns `{ id, authUrl? }`
- Connections persist in Agent's SQL storage — survive across requests
- `this.getMcpServers()` returns all servers, states, and tools array
- Dynamic server management: connect/disconnect multiple MCP servers programmatically
- Tools from all connected servers are aggregated and available to the agent

### Cross-Domain Authentication
- Docs: https://developers.cloudflare.com/agents/guides/cross-domain-authentication/
- WebSocket connections can't use HTTP cookies cross-origin — must use URL query param tokens
- Pattern: embed signed, short-lived JWT in WS connection URL (`?token=...`)
- Server-side `onConnect` handler extracts + validates token from URL
- JWT refresh pattern: validate before connect, refresh if expired, store in localStorage
- **Matches our existing pattern** — VaporForge already uses `?token=JWT` for WS auth
- Best practices: short-lived tokens (minutes), scope to specific agent, validate every connection, HTTPS/WSS only

### Securing MCP Servers
- Docs: https://developers.cloudflare.com/agents/guides/securing-mcp-server/
- Uses `workers-oauth-provider` for token management, client registration, access token validation
- **Consent dialog**: implement own consent screen to prevent "confused deputy" attacks
- **CSRF**: random tokens in `HttpOnly; Secure; SameSite=Lax` cookies, single-use
- **Input sanitization**: escape HTML in client names/logos/URIs, reject `javascript:` and `data:` URLs
- **CSP headers**: restrict scripts, disable framing, `X-Frame-Options: DENY`
- **State token binding**: store OAuth state in KV with 10-min expiry, bind to session via SHA-256
- **Cookie prefix**: use `__Host-` prefix to prevent subdomain attacks on `*.workers.dev`
- **Approved clients registry**: HMAC-signed cookies listing pre-approved clients (skip repeated consent)

## Security Considerations for VaporForge

Our current MCP OAuth implementation is missing several of these security measures:
- No CSRF protection on OAuth callback
- No consent dialog (we auto-approve)
- No `__Host-` cookie prefix (vulnerable on workers.dev subdomain)
- No state token expiry (should be 10 min max)
- No input sanitization on MCP server names/URLs from user config

## MCP Portals — Recommended Integrations Marketplace

Source: https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/

CF MCP Portals aggregate multiple MCP servers behind a single managed URL with Cloudflare Access auth, per-server OAuth, tool curation, and logging.

### Two-Tier MCP Strategy

| Tier | How it works | User experience |
|------|-------------|-----------------|
| **Recommended** (Portal-managed) | ~10 curated, pre-configured MCPs behind a CF Portal | One-click enable + OAuth with their account. No URL/config entry. |
| **Custom** (KV-managed, current) | User adds their own MCP server URL + config | Full flexibility for niche/internal servers. Current UX unchanged. |

### Recommended MCP Shortlist (v1)

| Server | Why | OAuth |
|--------|-----|-------|
| GitHub | Core dev workflow — repos, PRs, issues | Yes |
| Notion | Knowledge base, docs, wikis | Yes |
| Linear | Issue tracking (dev-focused alternative to Jira) | Yes |
| Sentry | Error monitoring, debugging context | Yes |
| Slack | Team communication, notifications | Yes |
| Google Drive | Docs, sheets, shared files | Yes |
| Figma | Design assets, component specs | Yes |
| Postgres (Neon) | Database queries, schema inspection | Connection string |
| Stripe | Payment data, customer lookup | API key |
| Vercel | Deployments, logs, project management | Yes |

### What the Portal Gives Us

- **Admin-managed OAuth** — we configure OAuth apps once, users just authenticate
- **Tool curation** — expose only the tools that make sense (less noise = better AI)
- **Logging** — every tool call logged through CF Access (audit trail for free)
- **Status monitoring** — Ready/Waiting/Error per server, auto-sync every 24h
- **No custom code per server** — portal handles transport, discovery, auth

### What We Still Build

- **UI toggle** in VF settings: "Recommended Integrations" section with on/off switches per MCP
- **Per-user OAuth state** — portal handles the OAuth flow, but we track which MCPs each user has enabled
- **Custom MCP path** — unchanged from current implementation for user-added servers

## Next Steps

1. Prototype: deploy a simple MCP server as a Worker using `createMcpHandler()`
2. Test OAuth flow with `DurableObjectOAuthClientProvider` against a GitHub MCP server
3. Compare latency: Worker-hosted MCP vs container-hosted MCP vs current relay
4. Evaluate migration path from custom OAuth to CF framework
5. Test MCP Elicitation as replacement for `ask_user_questions` tool
6. Security audit: add CSRF, state token expiry, `__Host-` prefix, input sanitization to current OAuth flow
7. Cross-domain: verify our JWT-in-WS-URL pattern matches CF's recommended approach
