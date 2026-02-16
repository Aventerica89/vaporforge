import { Hono } from 'hono';
import { McpServerConfigSchema } from '../types';
import type { User, ApiResponse, McpServerConfig } from '../types';

type Variables = {
  user: User;
};

export const mcpRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max MCP servers per user */
const MAX_SERVERS = 20;

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

  const { name, transport, url, command, args, localUrl, headers, env, credentialFile, credentialPath } = parsed.data;

  // Transport-specific validation
  if (transport === 'http' && !url) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'URL is required for HTTP transport',
    }, 400);
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

  const newServer: McpServerConfig = {
    name,
    transport,
    url,
    command,
    args,
    localUrl,
    headers,
    env,
    credentialFile,
    credentialPath,
    enabled: true,
    addedAt: new Date().toISOString(),
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
      const config: Record<string, unknown> = {
        command: server.command,
        args: server.args || [],
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
): Promise<{ tools: string[]; toolCount: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

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
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json() as {
      result?: { tools?: Array<{ name: string }> };
    };

    const toolList = data?.result?.tools;
    if (!Array.isArray(toolList)) return null;

    const names = toolList.map((t) => t.name).filter(Boolean);
    return { tools: names, toolCount: names.length };
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(server.url!, {
          method: 'GET',
          headers: server.headers || {},
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(server.url, {
      method: 'GET',
      headers: server.headers || {},
      signal: controller.signal,
    });
    clearTimeout(timer);

    const status = res.status === 401 || res.status === 403 ? 'auth-required' : 'online';

    // Discover tools if server is reachable
    let tools: string[] | undefined;
    let toolCount: number | undefined;
    if (status === 'online') {
      const discovered = await discoverTools(server.url, server.headers);
      if (discovered) {
        tools = discovered.tools;
        toolCount = discovered.toolCount;
        // Cache tools in KV
        const updated = servers.map((s) =>
          s.name === name ? { ...s, tools, toolCount } : s
        );
        await writeServers(c.env.SESSIONS_KV, user.id, updated);
      }
    }

    return c.json<ApiResponse<{
      status: string;
      httpStatus: number;
      tools?: string[];
      toolCount?: number;
    }>>({
      success: true,
      data: { status, httpStatus: res.status, tools, toolCount },
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
    if (server.credentialFile && server.credentialPath) {
      files.push({
        path: server.credentialPath,
        content: server.credentialFile,
      });
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
