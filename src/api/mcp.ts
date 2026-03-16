import { Hono } from 'hono';
import { McpServerConfigSchema } from '../types';
import type { User, ApiResponse, McpServerConfig } from '../types';
import { validateExternalUrl } from '../utils/validate-url';
import {
  detectOAuthRequirement,
  fetchAuthServerMetadata,
  getOrRegisterClient,
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  oauthStateKey,
  deleteOAuthTokens,
  readOAuthTokens,
  writeOAuthTokens,
  refreshTokenIfExpired,
} from './mcp-oauth';

type Variables = {
  user: User;
};

export const mcpRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max MCP servers per user */
const MAX_SERVERS = 20;

// Rate limit oauth/start per user — max 10 calls per minute (CF Worker in-memory, resets on cold start)
const oauthStartRateLimit = new Map<string, { count: number; resetAt: number }>();

/** KV key for a user's MCP server list */
function kvKey(userId: string): string {
  return `user-mcp:${userId}`;
}

/** Read MCP servers from KV (returns empty array on missing/invalid) */
async function readServers(
  kv: KVNamespace,
  userId: string
): Promise<McpServerConfig[]> {
  const raw = await kv.get(kvKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown) => McpServerConfigSchema.safeParse(item).success
    );
  } catch {
    return [];
  }
}

/** Write MCP servers to KV */
async function writeServers(
  kv: KVNamespace,
  userId: string,
  servers: McpServerConfig[]
): Promise<void> {
  await kv.put(kvKey(userId), JSON.stringify(servers));
}

// GET / — list all MCP servers for user
mcpRoutes.get('/', async (c) => {
  const user = c.get('user');
  const servers = await readServers(c.env.SESSIONS_KV, user.id);

  return c.json<ApiResponse<McpServerConfig[]>>({
    success: true,
    data: servers,
  });
});

// POST / — add a new MCP server
mcpRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Validate with schema (without addedAt/enabled — we set those)
  const parsed = McpServerConfigSchema.omit({
    addedAt: true,
    enabled: true,
  }).safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const { name, transport, url, command, args, localUrl, headers, env, credentialFiles } = parsed.data;

  // Transport-specific validation
  if (transport === 'http' && !url) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'URL is required for HTTP transport',
    }, 400);
  }

  if (transport === 'http' && url) {
    const urlError = validateExternalUrl(url);
    if (urlError) {
      return c.json<ApiResponse<never>>({ success: false, error: urlError }, 400);
    }
  }

  if (transport === 'stdio' && !command) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Command is required for stdio transport',
    }, 400);
  }

  if (transport === 'relay' && !localUrl) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Local URL is required for relay transport',
    }, 400);
  }

  const servers = await readServers(c.env.SESSIONS_KV, user.id);

  // Check uniqueness
  if (servers.some((s) => s.name === name)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Server "${name}" already exists`,
    }, 400);
  }

  // Check limit
  if (servers.length >= MAX_SERVERS) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Maximum of ${MAX_SERVERS} MCP servers reached`,
    }, 400);
  }

  // Detect OAuth requirement (non-blocking — failure does not prevent server add)
  let requiresOAuth = false;
  if (transport === 'http' && url) {
    try {
      const authServer = await detectOAuthRequirement(url);
      if (authServer) requiresOAuth = true;
    } catch { /* detection failure is non-fatal */ }
  }

  const newServer: McpServerConfig = {
    name,
    transport,
    url,
    command,
    args,
    localUrl,
    headers,
    env,
    credentialFiles,
    enabled: true,
    addedAt: new Date().toISOString(),
    ...(requiresOAuth ? { requiresOAuth: true, oauthStatus: 'pending' as const } : {}),
  };

  const updated = [...servers, newServer];
  await writeServers(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<McpServerConfig>>({
    success: true,
    data: newServer,
  });
});

// DELETE /:name — remove a server by name
mcpRoutes.delete('/:name', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');

  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const index = servers.findIndex((s) => s.name === name);

  if (index === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'MCP server not found',
    }, 404);
  }

  const updated = servers.filter((s) => s.name !== name);
  await writeServers(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});

// PUT /:name — update a server's config (name stays the same)
mcpRoutes.put('/:name', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');

  // Don't match the /toggle sub-route
  if (name === 'toggle') return c.notFound();

  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const index = servers.findIndex((s) => s.name === name);

  if (index === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'MCP server not found',
    }, 404);
  }

  const body = await c.req.json();
  const parsed = McpServerConfigSchema.omit({
    addedAt: true,
    enabled: true,
    name: true,
  }).safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const { transport, url, command, args, localUrl, headers, env, credentialFiles, mode, scope } = parsed.data;

  if (transport === 'http' && !url) {
    return c.json<ApiResponse<never>>({ success: false, error: 'URL is required for HTTP transport' }, 400);
  }
  if (transport === 'http' && url) {
    const urlError = validateExternalUrl(url);
    if (urlError) {
      return c.json<ApiResponse<never>>({ success: false, error: urlError }, 400);
    }
  }
  if (transport === 'stdio' && !command) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Command is required for stdio transport' }, 400);
  }
  if (transport === 'relay' && !localUrl) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Local URL is required for relay transport' }, 400);
  }

  const updatedServer: McpServerConfig = {
    ...servers[index],
    transport,
    url,
    command,
    args,
    localUrl,
    headers,
    env,
    credentialFiles,
    mode,
    scope,
  };

  const updated = servers.map((s) => (s.name === name ? updatedServer : s));
  await writeServers(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<McpServerConfig>>({
    success: true,
    data: updatedServer,
  });
});

// PATCH /:name — partial update (mode, scope)
mcpRoutes.patch('/:name', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');

  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const index = servers.findIndex((s) => s.name === name);

  if (index === -1) {
    return c.json<ApiResponse<never>>({ success: false, error: 'MCP server not found' }, 404);
  }

  const body = await c.req.json();
  const patchSchema = McpServerConfigSchema.pick({ mode: true, scope: true });
  const parsed = patchSchema.partial().safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const updatedServer: McpServerConfig = { ...servers[index], ...parsed.data };
  const updated = servers.map((s) => (s.name === name ? updatedServer : s));
  await writeServers(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<McpServerConfig>>({ success: true, data: updatedServer });
});

// PUT /:name/toggle — toggle enabled/disabled
mcpRoutes.put('/:name/toggle', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');

  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const index = servers.findIndex((s) => s.name === name);

  if (index === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'MCP server not found',
    }, 404);
  }

  const toggled: McpServerConfig = {
    ...servers[index],
    enabled: !servers[index].enabled,
  };

  const updated = servers.map((s) => (s.name === name ? toggled : s));
  await writeServers(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<McpServerConfig>>({
    success: true,
    data: toggled,
  });
});

// GET /:name/oauth/start — initiate PKCE OAuth flow
mcpRoutes.get('/:name/oauth/start', async (c) => {
  const user = c.get('user');

  // Rate limit: max 10 calls per user per minute
  const rl = oauthStartRateLimit.get(user.id) ?? { count: 0, resetAt: Date.now() + 60_000 };
  if (Date.now() > rl.resetAt) { rl.count = 0; rl.resetAt = Date.now() + 60_000; }
  rl.count++;
  oauthStartRateLimit.set(user.id, rl);
  if (rl.count > 10) return c.json<ApiResponse<never>>({ success: false, error: 'Rate limit exceeded' }, 429);

  const serverName = c.req.param('name');
  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const server = servers.find((s) => s.name === serverName);

  if (!server || server.transport !== 'http' || !server.url) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Server not found or not HTTP' }, 404);
  }

  const authServerUrl = await detectOAuthRequirement(server.url);
  if (!authServerUrl) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Server does not require OAuth' }, 400);
  }

  const metadata = await fetchAuthServerMetadata(authServerUrl);
  if (!metadata) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Could not fetch OAuth server metadata' }, 502);
  }

  const callbackUrl = `${new URL(c.req.url).origin}/api/mcp-oauth/callback`;

  let clientId: string;
  try {
    clientId = await getOrRegisterClient(c.env.SESSIONS_KV, user.id, serverName, metadata, callbackUrl);
  } catch (err) {
    return c.json<ApiResponse<never>>({ success: false, error: `DCR failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const codeVerifier = generateCodeVerifier();
  const [codeChallenge, state] = await Promise.all([
    computeCodeChallenge(codeVerifier),
    Promise.resolve(generateState()),
  ]);

  await c.env.SESSIONS_KV.put(oauthStateKey(state), JSON.stringify({
    userId: user.id, serverName, serverUrl: server.url,
    codeVerifier, redirectUri: callbackUrl, clientId,
    metadata: { token_endpoint: metadata.token_endpoint, authorization_endpoint: metadata.authorization_endpoint },
    createdAt: Date.now(),
  }), { expirationTtl: 30 * 60 });

  const authUrl = new URL(metadata.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  // RFC 8707: resource parameter binds tokens to this MCP server (required by MCP spec)
  authUrl.searchParams.set('resource', server.url);
  if (metadata.scopes_supported?.length) {
    authUrl.searchParams.set('scope', metadata.scopes_supported.join(' '));
  }

  return c.json<ApiResponse<{ authUrl: string }>>({ success: true, data: { authUrl: authUrl.toString() } });
});

// DELETE /:name/oauth — revoke stored OAuth tokens
mcpRoutes.delete('/:name/oauth', async (c) => {
  const user = c.get('user');
  const serverName = c.req.param('name');
  await deleteOAuthTokens(c.env.SESSIONS_KV, user.id, serverName);
  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  await writeServers(
    c.env.SESSIONS_KV,
    user.id,
    servers.map((s) => s.name === serverName ? { ...s, oauthStatus: 'none' as const } : s),
  );
  return c.json<ApiResponse<{ revoked: boolean }>>({ success: true, data: { revoked: true } });
});

/**
 * Collect enabled MCP servers for a user, returning them in the
 * ~/.claude.json mcpServers format.
 *
 * Relay transport servers are transformed to HTTP pointing at the
 * in-container mcp-relay-proxy on localhost:9788.
 */
export async function collectMcpConfig(
  kv: KVNamespace,
  userId: string
): Promise<Record<string, Record<string, unknown>>> {
  const servers = await readServers(kv, userId);
  const result: Record<string, Record<string, unknown>> = {};

  for (const server of servers) {
    if (!server.enabled) continue;

    if (server.transport === 'http' && server.url) {
      const config: Record<string, unknown> = {
        type: 'http',
        url: server.url,
      };
      if (server.headers && Object.keys(server.headers).length > 0) {
        config.headers = server.headers;
      }
      result[server.name] = config;
    } else if (server.transport === 'stdio' && server.command) {
      // Parse command field: user may enter "npx @package/name --flag"
      // but the SDK expects command="npx", args=["@package/name","--flag"].
      // Split on whitespace: first token is the executable, rest are args.
      const parts = server.command.trim().split(/\s+/);
      const executable = parts[0];
      const inlineArgs = parts.slice(1);
      const config: Record<string, unknown> = {
        command: executable,
        args: [...inlineArgs, ...(server.args || [])],
      };
      if (server.env && Object.keys(server.env).length > 0) {
        config.env = server.env;
      }
      result[server.name] = config;
    } else if (server.transport === 'relay' && server.localUrl) {
      // Relay: SDK talks to the in-container proxy which tunnels to the browser
      result[server.name] = {
        type: 'http',
        url: `http://127.0.0.1:9788/mcp/${server.name}`,
      };
    }
  }

  return result;
}

/** Query an MCP server for its available tools via JSON-RPC */
async function discoverTools(
  url: string,
  headers?: Record<string, string>
): Promise<{
  tools: string[];
  toolCount: number;
  toolSchemas: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  pingMs: number;
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const start = Date.now();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      signal: controller.signal,
    });
    const pingMs = Date.now() - start;
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json() as {
      result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
    };

    const toolList = data?.result?.tools;
    if (!Array.isArray(toolList)) return null;

    const names = toolList.map((t) => t.name).filter(Boolean);
    const toolSchemas = toolList.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(t.inputSchema ? { inputSchema: t.inputSchema } : {}),
    }));
    return { tools: names, toolCount: names.length, toolSchemas, pingMs };
  } catch {
    return null;
  }
}

// POST /ping — batch health-check all enabled HTTP servers
mcpRoutes.post('/ping', async (c) => {
  const user = c.get('user');
  const servers = await readServers(c.env.SESSIONS_KV, user.id);

  const results: Record<string, { status: string; httpStatus?: number }> = {};
  const httpServers = servers.filter((s) => s.enabled && s.transport === 'http' && s.url);

  await Promise.all(
    httpServers.map(async (server) => {
      try {
        let effectiveHeaders: Record<string, string> = server.headers || {};
        if (server.requiresOAuth) {
          const storedTokens = await readOAuthTokens(c.env.SESSIONS_KV, user.id, server.name);
          if (storedTokens) {
            const refreshed = await refreshTokenIfExpired(storedTokens);
            const tokenToUse = refreshed ?? storedTokens;
            if (refreshed && refreshed !== storedTokens) {
              await writeOAuthTokens(c.env.SESSIONS_KV, user.id, server.name, refreshed);
            }
            effectiveHeaders = { ...effectiveHeaders, Authorization: `Bearer ${tokenToUse.accessToken}` };
          }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(server.url!, {
          method: 'GET',
          headers: effectiveHeaders,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 401 || res.status === 403) {
          results[server.name] = { status: 'auth-required', httpStatus: res.status };
        } else {
          results[server.name] = { status: 'online', httpStatus: res.status };
        }
      } catch {
        results[server.name] = { status: 'offline' };
      }
    })
  );

  // Mark non-HTTP / disabled servers
  for (const server of servers) {
    if (results[server.name]) continue;
    if (!server.enabled) {
      results[server.name] = { status: 'disabled' };
    } else if (server.transport === 'relay') {
      results[server.name] = { status: 'relay' };
    } else {
      results[server.name] = { status: 'unknown' };
    }
  }

  return c.json<ApiResponse<Record<string, { status: string; httpStatus?: number }>>>({
    success: true,
    data: results,
  });
});

// POST /:name/ping — single server health-check
mcpRoutes.post('/:name/ping', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');
  const servers = await readServers(c.env.SESSIONS_KV, user.id);
  const server = servers.find((s) => s.name === name);

  if (!server) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Not found' }, 404);
  }

  if (server.transport !== 'http' || !server.url) {
    return c.json<ApiResponse<{ status: string }>>({
      success: true,
      data: { status: server.transport === 'relay' ? 'relay' : 'unknown' },
    });
  }

  try {
    // Build effective headers: base headers + OAuth Bearer token if available
    let effectiveHeaders: Record<string, string> = server.headers || {};
    if (server.requiresOAuth) {
      const storedTokens = await readOAuthTokens(c.env.SESSIONS_KV, user.id, name);
      if (storedTokens) {
        const refreshed = await refreshTokenIfExpired(storedTokens);
        const tokenToUse = refreshed ?? storedTokens;
        if (refreshed && refreshed !== storedTokens) {
          await writeOAuthTokens(c.env.SESSIONS_KV, user.id, name, refreshed);
        }
        effectiveHeaders = { ...effectiveHeaders, Authorization: `Bearer ${tokenToUse.accessToken}` };
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(server.url, {
      method: 'GET',
      headers: effectiveHeaders,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const status = res.status === 401 || res.status === 403 ? 'auth-required' : 'online';

    // Discover tools if server is reachable
    let tools: string[] | undefined;
    let toolCount: number | undefined;
    let toolSchemas: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> | undefined;
    let pingMs: number | undefined;
    if (status === 'online') {
      const discovered = await discoverTools(server.url, effectiveHeaders);
      if (discovered) {
        tools = discovered.tools;
        toolCount = discovered.toolCount;
        toolSchemas = discovered.toolSchemas;
        pingMs = discovered.pingMs;
        const now = new Date().toISOString();
        // Cache tools + ping data in KV
        const updated = servers.map((s) =>
          s.name === name ? { ...s, tools, toolCount, toolSchemas, lastPingAt: now, lastPingMs: pingMs } : s
        );
        await writeServers(c.env.SESSIONS_KV, user.id, updated);
      }
    }

    return c.json<ApiResponse<{
      status: string;
      httpStatus: number;
      tools?: string[];
      toolCount?: number;
      toolSchemas?: typeof toolSchemas;
      pingMs?: number;
    }>>({
      success: true,
      data: { status, httpStatus: res.status, tools, toolCount, toolSchemas, pingMs },
    });
  } catch {
    return c.json<ApiResponse<{ status: string }>>({
      success: true,
      data: { status: 'offline' },
    });
  }
});

/**
 * Collect credential files from enabled MCP servers for container injection.
 * Returns an array of { path, content } pairs to write into the container filesystem.
 */
export async function collectCredentialFiles(
  kv: KVNamespace,
  userId: string
): Promise<Array<{ path: string; content: string }>> {
  const servers = await readServers(kv, userId);
  const files: Array<{ path: string; content: string }> = [];

  for (const server of servers) {
    if (!server.enabled) continue;
    if (server.credentialFiles && server.credentialFiles.length > 0) {
      for (const cred of server.credentialFiles) {
        files.push({ path: cred.path, content: cred.content });
      }
    }
  }

  return files;
}

/** Check if a user has any enabled relay-transport MCP servers */
export async function hasRelayServers(
  kv: KVNamespace,
  userId: string
): Promise<boolean> {
  const servers = await readServers(kv, userId);
  return servers.some((s) => s.transport === 'relay' && s.enabled && s.localUrl);
}
