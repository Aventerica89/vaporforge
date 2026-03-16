/**
 * MCP OAuth — Worker as OAuth Client
 *
 * PKCE flow for OAuth-protected external MCP servers.
 * Tokens stored in SESSIONS_KV, injected as ~/.claude/.credentials.json at session start.
 *
 * KV keys (all in SESSIONS_KV):
 *   mcp:oauth:{userId}:{serverName}  — access/refresh tokens
 *   mcp:oauth:state:{state}          — PKCE state (30-min TTL)
 *   mcp:oauth:client:{userId}:{name} — registered client_id (DCR)
 */
import { Hono } from 'hono';
import type { User } from '../types';

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function validateExternalUrl(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}: invalid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label}: must use HTTPS (got ${url.protocol})`);
  }
  const host = url.hostname.toLowerCase();
  // Check private/internal IP ranges (RFC 1918, link-local, loopback)
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
    /^fe80:/i,
  ];
  if (
    host === 'localhost' ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    privateRanges.some((re) => re.test(host))
  ) {
    throw new Error(`${label}: private/internal hosts not allowed`);
  }
  return url;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface McpOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId: string;
  tokenType: string;
  discoveryState: {
    authorizationServerMetadata: {
      token_endpoint: string;
      authorization_endpoint?: string;
    };
  };
}

export interface McpOAuthTokensWithName extends McpOAuthTokens {
  serverName: string;
}

interface OAuthPkceState {
  userId: string;
  serverName: string;
  serverUrl: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  metadata: {
    token_endpoint: string;
    authorization_endpoint: string;
  };
  createdAt: number;
}

export interface AuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  issuer?: string;
}

// ─── KV helpers ────────────────────────────────────────────────────────────

export const oauthTokenKey = (userId: string, name: string) =>
  `mcp:oauth:${userId}:${name}`;

export const oauthStateKey = (state: string) => `mcp:oauth:state:${state}`;

export const oauthClientKey = (userId: string, name: string) =>
  `mcp:oauth:client:${userId}:${name}`;

export async function readOAuthTokens(
  kv: KVNamespace,
  userId: string,
  name: string,
): Promise<McpOAuthTokens | null> {
  return kv.get<McpOAuthTokens>(oauthTokenKey(userId, name), 'json');
}

export async function writeOAuthTokens(
  kv: KVNamespace,
  userId: string,
  name: string,
  tokens: McpOAuthTokens,
): Promise<void> {
  await kv.put(oauthTokenKey(userId, name), JSON.stringify(tokens));
}

export async function deleteOAuthTokens(
  kv: KVNamespace,
  userId: string,
  name: string,
): Promise<void> {
  await kv.delete(oauthTokenKey(userId, name));
}

export async function readAllOAuthTokens(
  kv: KVNamespace,
  userId: string,
): Promise<McpOAuthTokensWithName[]> {
  const prefix = `mcp:oauth:${userId}:`;
  const allKeys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor } as KVNamespaceListOptions);
    allKeys.push(...page.keys);
    cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
  } while (cursor);
  if (!allKeys.length) return [];
  const results = await Promise.all(
    allKeys.map(async (key) => {
      const serverName = key.name.slice(prefix.length);
      const tokens = await kv.get<McpOAuthTokens>(key.name, 'json');
      return tokens ? { ...tokens, serverName } : null;
    }),
  );
  return results.filter((t): t is McpOAuthTokensWithName => t !== null);
}

// ─── PKCE utilities ────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return uint8ArrayToBase64Url(bytes);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return uint8ArrayToBase64Url(new Uint8Array(digest));
}

export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Discovery ─────────────────────────────────────────────────────────────

/**
 * Check if HTTP MCP server requires OAuth.
 * Returns auth server URL if required, null otherwise.
 */
export async function detectOAuthRequirement(
  serverUrl: string,
): Promise<string | null> {
  validateExternalUrl(serverUrl, 'serverUrl');

  // Strategy 1: well-known resource metadata (RFC 9728)
  try {
    const url = new URL('/.well-known/oauth-protected-resource', serverUrl);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { authorization_servers?: string[] };
      const raw = data.authorization_servers?.[0];
      if (raw) {
        try { validateExternalUrl(raw, 'authorization_server'); return raw; } catch { /* invalid */ }
      }
    }
  } catch { /* try fallback */ }

  // Strategy 2: probe endpoint for 401 + WWW-Authenticate header (MCP OAuth spec fallback)
  try {
    const probe = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vaporforge', version: '1.0' } } }),
      signal: AbortSignal.timeout(5000),
    });
    if (probe.status === 401) {
      const wwwAuth = probe.headers.get('WWW-Authenticate') ?? '';
      // Try resource_metadata URL first
      const rmMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
      if (rmMatch) {
        try {
          validateExternalUrl(rmMatch[1], 'resource_metadata');
          const rmRes = await fetch(rmMatch[1], { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
          if (rmRes.ok) {
            const data = (await rmRes.json()) as { authorization_servers?: string[] };
            const raw = data.authorization_servers?.[0];
            if (raw) { try { validateExternalUrl(raw, 'authorization_server'); return raw; } catch { /* invalid */ } }
          }
        } catch { /* continue */ }
      }
      // Fall back to Bearer realm
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (realmMatch) {
        try { validateExternalUrl(realmMatch[1], 'realm'); return realmMatch[1]; } catch { /* invalid */ }
      }
    }
  } catch { /* not OAuth */ }

  return null;
}

export async function fetchAuthServerMetadata(
  authServerUrl: string,
): Promise<AuthServerMetadata | null> {
  validateExternalUrl(authServerUrl, 'authServerUrl');
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ]) {
    try {
      const res = await fetch(new URL(path, authServerUrl).toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<AuthServerMetadata>;
      if (data.authorization_endpoint && data.token_endpoint) {
        try {
          validateExternalUrl(data.authorization_endpoint, 'authorization_endpoint');
          validateExternalUrl(data.token_endpoint, 'token_endpoint');
          if (data.registration_endpoint) {
            validateExternalUrl(data.registration_endpoint, 'registration_endpoint');
          }
        } catch {
          continue;
        }
        return {
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          registration_endpoint: data.registration_endpoint,
          scopes_supported: data.scopes_supported,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ─── DCR (Dynamic Client Registration RFC 7591) ───────────────────────────

export async function getOrRegisterClient(
  kv: KVNamespace,
  userId: string,
  serverName: string,
  metadata: AuthServerMetadata,
  callbackUrl: string,
): Promise<string> {
  const existing = await kv.get(oauthClientKey(userId, serverName));
  if (existing) return existing;
  if (!metadata.registration_endpoint) return 'vaporforge';
  validateExternalUrl(metadata.registration_endpoint, 'registration_endpoint');

  const res = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'VaporForge',
      redirect_uris: [callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`DCR failed: ${res.status}`);
  const data = (await res.json()) as { client_id: string };
  if (!data.client_id) throw new Error('DCR missing client_id');

  await kv.put(oauthClientKey(userId, serverName), data.client_id, {
    expirationTtl: 365 * 24 * 60 * 60,
  });
  return data.client_id;
}

// ─── Token exchange ────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
  tokenEndpoint: string,
  resourceUrl?: string,
): Promise<McpOAuthTokens> {
  validateExternalUrl(tokenEndpoint, 'tokenEndpoint');
  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  };
  // RFC 8707: include resource to bind token to this specific MCP server
  if (resourceUrl) bodyParams.resource = resourceUrl;
  const body = new URLSearchParams(bodyParams);
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 200);
    console.error(`[mcp-oauth] token exchange HTTP ${res.status}: ${errBody}`);
    throw new Error(`token_exchange_failed`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!data.access_token) throw new Error('Missing access_token');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // If expires_in is absent, the provider issues non-expiring tokens (e.g. Notion).
    // Use 1 year as sentinel; refreshTokenIfExpired will only act on tokens near expiry.
    expiresAt: Date.now() + (data.expires_in ?? 365 * 24 * 3600) * 1000,
    clientId,
    tokenType: data.token_type ?? 'Bearer',
    discoveryState: {
      authorizationServerMetadata: { token_endpoint: tokenEndpoint },
    },
  };
}

// ─── Token refresh ─────────────────────────────────────────────────────────

export async function refreshTokenIfExpired(
  tokens: McpOAuthTokens,
): Promise<McpOAuthTokens | null> {
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  if (!tokens.refreshToken) return null;
  const { token_endpoint } =
    tokens.discoveryState.authorizationServerMetadata;
  try {
    validateExternalUrl(token_endpoint, 'token_endpoint');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: tokens.clientId,
    });
    const res = await fetch(token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    return {
      ...tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 365 * 24 * 3600) * 1000,
    };
  } catch {
    return null;
  }
}

// ─── Credentials file builder ──────────────────────────────────────────────

/**
 * Build ~/.claude/.credentials.json content.
 * Key = serverName (must match key in ~/.claude.json mcpServers).
 * Note: Claude CLI may use "serverName|hash" when it stores tokens itself.
 * VF-pre-populated "serverName" should work since VF controls ~/.claude.json too.
 */
const SERVER_NAME_RE = /^[a-zA-Z0-9._\-]+$/;

export function buildCredentialsFile(
  tokens: McpOAuthTokensWithName[],
): string {
  const mcpOAuth: Record<string, Omit<McpOAuthTokensWithName, 'serverName'>> =
    {};
  for (const { serverName, ...rest } of tokens) {
    if (!SERVER_NAME_RE.test(serverName)) {
      console.warn(`[mcp-oauth] buildCredentialsFile: skipping invalid serverName "${serverName}"`);
      continue;
    }
    mcpOAuth[serverName] = rest;
  }
  return JSON.stringify({ mcpOAuth }, null, 2);
}

// ─── Public OAuth callback route ───────────────────────────────────────────

type Variables = { user: User };
const OAUTH_ERROR_ALLOWLIST = new Set(['access_denied', 'invalid_scope', 'server_error', 'temporarily_unavailable']);

// Rate limit callback by state value — max 3 attempts per state (CF Worker in-memory, resets on cold start)
// Tracks attempt count + first-seen timestamp so stale entries can be pruned.
// State values expire from KV after 30 minutes; entries older than that window are dead.
const CALLBACK_RL_WINDOW_MS = 30 * 60 * 1000;
const callbackRateLimit = new Map<string, { count: number; firstSeen: number }>();

export const mcpOAuthPublicRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

mcpOAuthPublicRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const appBase = new URL(c.req.url).origin;
  const settingsUrl = `${appBase}/app/#settings/integrations`;

  if (error || !code || !state) {
    const safeError = error && OAUTH_ERROR_ALLOWLIST.has(error) ? error : 'oauth_error';
    return c.redirect(
      `${settingsUrl}?oauth_error=${encodeURIComponent(safeError)}`,
    );
  }

  // Rate limit: max 3 attempts per state value
  // Prune stale entries on each access to prevent unbounded Map growth
  const rlNow = Date.now();
  for (const [k, v] of callbackRateLimit) {
    if (rlNow - v.firstSeen > CALLBACK_RL_WINDOW_MS) callbackRateLimit.delete(k);
  }
  const existing = callbackRateLimit.get(state);
  const attempts = (existing?.count ?? 0) + 1;
  callbackRateLimit.set(state, { count: attempts, firstSeen: existing?.firstSeen ?? rlNow });
  if (attempts > 3) return c.json({ error: 'Too many attempts' }, 429);

  const pkceState = await c.env.SESSIONS_KV.get<OAuthPkceState>(
    oauthStateKey(state),
    'json',
  );
  if (!pkceState) {
    return c.redirect(`${settingsUrl}?oauth_error=state_expired`);
  }

  let tokens: McpOAuthTokens;
  try {
    tokens = await exchangeCodeForTokens(
      code,
      pkceState.codeVerifier,
      pkceState.clientId,
      pkceState.redirectUri,
      pkceState.metadata.token_endpoint,
      pkceState.serverUrl,
    );
    tokens = {
      ...tokens,
      discoveryState: {
        authorizationServerMetadata: {
          token_endpoint: pkceState.metadata.token_endpoint,
          authorization_endpoint: pkceState.metadata.authorization_endpoint,
        },
      },
    };
  } catch (err) {
    console.error('[mcp-oauth] callback token exchange failed:', err);
    return c.redirect(`${settingsUrl}?oauth_error=token_exchange_failed`);
  }

  // Delete PKCE state only after successful token exchange so the user can retry on failure
  await c.env.SESSIONS_KV.delete(oauthStateKey(state));

  await writeOAuthTokens(
    c.env.SESSIONS_KV,
    pkceState.userId,
    pkceState.serverName,
    tokens,
  );

  // Update server oauthStatus to 'authorized'
  const raw = await c.env.SESSIONS_KV.get(`user-mcp:${pkceState.userId}`);
  if (raw) {
    try {
      const servers = JSON.parse(raw) as Array<{
        name: string;
        oauthStatus?: string;
      }>;
      await c.env.SESSIONS_KV.put(
        `user-mcp:${pkceState.userId}`,
        JSON.stringify(
          servers.map((s) =>
            s.name === pkceState.serverName
              ? { ...s, oauthStatus: 'authorized' }
              : s,
          ),
        ),
      );
    } catch {
      /* non-critical */
    }
  }

  const safeServerName = encodeURIComponent(pkceState.serverName);
  return c.redirect(`${settingsUrl}?oauth_success=${safeServerName}`);
});
