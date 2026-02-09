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

  const { name, transport, url, command, args } = parsed.data;

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
      result[server.name] = {
        type: 'http',
        url: server.url,
      };
    } else if (server.transport === 'stdio' && server.command) {
      result[server.name] = {
        command: server.command,
        args: server.args || [],
      };
    }
  }

  return result;
}
