**Added:** 2026-03-13
**Status:** Idea
**Category:** VaporForge / MCP

## Summary

VaporForge Worker acts as the OAuth 2.1 client for HTTP MCP servers that require authorization. Containers are headless and can't do browser-based OAuth redirects — the Worker handles the full flow at MCP server setup time, stores tokens in SESSIONS_KV, and injects them into the container at session start.

## Details

### Problem
- HTTP MCP servers (GitHub, Linear, etc.) use OAuth 2.1 authorization code + PKCE
- Claude CLI inside the container would normally call `redirectToAuthorization(url)` — not possible headlessly
- Container needs pre-authorized tokens before it can connect

### Solution: Worker-as-OAuth-Client (Pre-auth flow)

```
[MCP Setup UI]
  User adds HTTP MCP server URL
      ↓
[Worker]
  Discovers Protected Resource Metadata (.well-known/oauth-protected-resource)
  Runs AS metadata discovery (RFC 8414 / OIDC)
  Generates PKCE (challenge + verifier), stores verifier in KV keyed by state param
  Redirects browser → Authorization Server
      ↓
[User's Browser]
  User approves on AS
  AS redirects → vaporforge.dev/api/mcp/oauth/callback?code=...&state=...
      ↓
[Worker /api/mcp/oauth/callback]
  Retrieves PKCE verifier from KV via state param
  Exchanges code → access_token + refresh_token
  Stores tokens: mcp:oauth:{userId}:{serverName} in SESSIONS_KV
      ↓
[Session Start]
  Worker reads stored tokens
  Checks expiry → refreshes using refresh_token if needed
  Injects tokens into container at ~/.claude/ token cache location before session starts
```

### MCP OAuth Spec Requirements (2025-11-25)
- HTTP transports only; STDIO explicitly excluded
- PKCE S256 mandatory
- `resource` parameter (RFC 8707) on every auth + token request
- Client registration: Client ID Metadata Documents preferred (client_id is a URL to a JSON doc)
- Bearer token on every HTTP request: `Authorization: Bearer <token>`
- MCP server validates token audience

### TypeScript SDK Reference
- `OAuthClientProvider` interface in `@modelcontextprotocol/client` — implement `tokens()`, `saveTokens()`, `redirectToAuthorization()`, `saveCodeVerifier()`, `codeVerifier()`
- `auth(provider, options)` — top-level entry point handles full flow + retry logic
- `ClientCredentialsProvider` — ready-made for M2M flows (no browser needed)
- Worker implements this interface with SESSIONS_KV as the token store

### AI SDK MCP Client (preferred for Worker path)

`@ai-sdk/mcp` has built-in `authProvider` support — significantly reduces implementation scope:

```javascript
import { createMCPClient } from '@ai-sdk/mcp';

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: serverUrl,
    authProvider: vfOAuthProvider,  // implements OAuthClientProvider
  },
});

// Use for tool discovery, QuickChat MCP tools, etc.
const tools = await mcpClient.tools();
```

VaporForge only needs to implement `OAuthClientProvider` (token persistence in SESSIONS_KV + redirect URL return). The AI SDK handles OAuth discovery, PKCE, token exchange, and refresh automatically.

**Scope split:**
- **Worker** (new): `createMCPClient` + `OAuthClientProvider` for tool discovery, QuickChat MCP, setup-time ping
- **Container/CLI** (existing): Claude CLI manages MCP connections for main chat sessions via `~/.claude.json`; pre-authorized tokens injected at session start via credential file mechanism

### Alternative: Dedicated McpOAuthAgent DO
A long-lived Durable Object that acts as the OAuth client — handles token storage, proactive refresh, server discovery caching. Cleaner separation if multiple users auth to the same MCP server.

### Alternative: VibeSDK (researched — not applicable)
VibeSDK is Cloudflare's own VaporForge-equivalent (web AI coding on Workers + containers). Its OAuth is user login only (Google/GitHub) and AI provider API key collection. No MCP OAuth support. Not useful here.

### Alternative: Google Vertex / service account auth
For Google services (Drive, Calendar, BigQuery) — service account JSON key → Bearer token at session start. No interactive OAuth needed, much simpler. Static credential injection via existing credential file mechanism.

## Open Questions

1. Where does the Claude CLI store MCP OAuth tokens on disk in the container? (`~/.claude/mcp-auth/`? A settings file?)
2. Does `~/.claude.json` support pre-stored OAuth tokens per MCP server, or does CLI manage a separate token cache?
3. Does VibeSDK handle any of this automatically?

## Next Steps

1. Dig into Claude CLI source to find MCP OAuth token storage location on disk
2. Research VibeSDK MCP OAuth capabilities
3. Decide: Worker-as-client vs. McpOAuthAgent DO
4. Add new routes: `GET /api/mcp/oauth/start`, `GET /api/mcp/oauth/callback`
5. Add token refresh logic to session start (sandbox.ts or ChatSessionAgent)
6. UI: "Connect" button per HTTP MCP server in McpDetail component
