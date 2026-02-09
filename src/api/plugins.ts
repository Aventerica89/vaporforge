import { Hono } from 'hono';
import type { Context } from 'hono';
import type { User, ApiResponse, Plugin, PluginItem } from '../types';
import { PluginSchema, PluginItemSchema, McpServerConfigSchema } from '../types';

type Variables = {
  user: User;
};

export const pluginsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max custom plugins per user */
const MAX_PLUGINS = 20;

/** Max items per category per plugin */
const MAX_ITEMS_PER_CATEGORY = 10;

/** Max content size per item (50KB) */
const MAX_ITEM_CONTENT = 50_000;

/** KV key for a user's plugins list */
function kvKey(userId: string): string {
  return `user-plugins:${userId}`;
}

const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: 'builtin-code-review',
    name: 'Code Review',
    description: 'Code review agent and /review command',
    scope: 'local' as const,
    enabled: true,
    builtIn: true,
    agents: [{
      name: 'Code Reviewer',
      filename: 'code-reviewer.md',
      content: 'You are a code review agent. Review code for quality, security, and maintainability issues. Provide specific, actionable feedback.',
      enabled: true,
    }],
    commands: [{
      name: 'Review',
      filename: 'review.md',
      content: 'Review the current code changes for quality, security, and best practices.',
      enabled: true,
    }],
    rules: [],
    mcpServers: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-test-writer',
    name: 'Test Writer',
    description: 'Test generation agent and /test command',
    scope: 'local' as const,
    enabled: true,
    builtIn: true,
    agents: [{
      name: 'Test Writer',
      filename: 'test-writer.md',
      content: 'You are a test writing agent. Generate comprehensive unit and integration tests. Follow TDD principles. Target 80% coverage.',
      enabled: true,
    }],
    commands: [{
      name: 'Test',
      filename: 'test.md',
      content: 'Generate tests for the current code. Include edge cases and error scenarios.',
      enabled: true,
    }],
    rules: [],
    mcpServers: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-documentation',
    name: 'Documentation',
    description: 'Documentation agent and /docs command',
    scope: 'local' as const,
    enabled: true,
    builtIn: true,
    agents: [{
      name: 'Doc Writer',
      filename: 'doc-writer.md',
      content: 'You are a documentation agent. Write clear, concise documentation. Include examples and usage patterns.',
      enabled: true,
    }],
    commands: [{
      name: 'Docs',
      filename: 'docs.md',
      content: 'Generate or update documentation for the current project or file.',
      enabled: true,
    }],
    rules: [],
    mcpServers: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-refactoring',
    name: 'Refactoring',
    description: 'Refactoring agent and /refactor command',
    scope: 'local' as const,
    enabled: true,
    builtIn: true,
    agents: [{
      name: 'Refactorer',
      filename: 'refactorer.md',
      content: 'You are a refactoring agent. Improve code structure without changing behavior. Focus on readability, DRY, and SOLID principles.',
      enabled: true,
    }],
    commands: [{
      name: 'Refactor',
      filename: 'refactor.md',
      content: 'Refactor the current code for better structure and maintainability.',
      enabled: true,
    }],
    rules: [],
    mcpServers: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Read user plugins from KV */
async function readPlugins(
  kv: KVNamespace,
  userId: string
): Promise<Plugin[]> {
  const raw = await kv.get(kvKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Write user plugins to KV */
async function writePlugins(
  kv: KVNamespace,
  userId: string,
  plugins: Plugin[]
): Promise<void> {
  await kv.put(kvKey(userId), JSON.stringify(plugins));
}

/** Merge built-in plugins with user overrides from KV */
function mergeWithBuiltIns(userPlugins: Plugin[]): Plugin[] {
  const builtInOverrides = new Map<string, Plugin>();
  const customPlugins: Plugin[] = [];

  for (const p of userPlugins) {
    if (p.builtIn) {
      builtInOverrides.set(p.id, p);
    } else {
      customPlugins.push(p);
    }
  }

  const merged = BUILTIN_PLUGINS.map((builtin) => {
    const override = builtInOverrides.get(builtin.id);
    if (!override) return builtin;
    return {
      ...builtin,
      enabled: override.enabled,
      agents: builtin.agents.map((a) => {
        const oa = override.agents.find((x) => x.filename === a.filename);
        return oa ? { ...a, enabled: oa.enabled } : a;
      }),
      commands: builtin.commands.map((c) => {
        const oc = override.commands.find((x) => x.filename === c.filename);
        return oc ? { ...c, enabled: oc.enabled } : c;
      }),
      rules: builtin.rules.map((r) => {
        const or = override.rules.find((x) => x.filename === r.filename);
        return or ? { ...r, enabled: or.enabled } : r;
      }),
    };
  });

  return [...merged, ...customPlugins];
}

// GET / — list all plugins (built-in + custom)
pluginsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const userPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
  const all = mergeWithBuiltIns(userPlugins);

  return c.json<ApiResponse<Plugin[]>>({
    success: true,
    data: all,
  });
});

// POST / — add a custom plugin
pluginsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Prevent adding with builtIn flag
  if (body.builtIn) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Cannot add a built-in plugin',
    }, 400);
  }

  const now = new Date().toISOString();
  const pluginData = {
    ...body,
    id: crypto.randomUUID(),
    builtIn: false,
    addedAt: now,
    updatedAt: now,
  };

  const parsed = PluginSchema.safeParse(pluginData);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid plugin data',
    }, 400);
  }

  const plugin = parsed.data;

  // Validate item limits per category
  for (const cat of ['agents', 'commands', 'rules'] as const) {
    if (plugin[cat].length > MAX_ITEMS_PER_CATEGORY) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Maximum ${MAX_ITEMS_PER_CATEGORY} items per category`,
      }, 400);
    }
    for (const item of plugin[cat]) {
      if (item.content.length > MAX_ITEM_CONTENT) {
        return c.json<ApiResponse<never>>({
          success: false,
          error: `Item content exceeds ${MAX_ITEM_CONTENT} byte limit`,
        }, 400);
      }
    }
  }

  const userPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
  const customCount = userPlugins.filter((p) => !p.builtIn).length;

  if (customCount >= MAX_PLUGINS) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Maximum of ${MAX_PLUGINS} custom plugins reached`,
    }, 400);
  }

  const updated = [...userPlugins, plugin];
  await writePlugins(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<Plugin>>({
    success: true,
    data: plugin,
  });
});

// DELETE /:id — remove a plugin
pluginsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Cannot delete built-in plugins
  if (BUILTIN_PLUGINS.some((b) => b.id === id)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Cannot delete a built-in plugin',
    }, 400);
  }

  const userPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
  const idx = userPlugins.findIndex((p) => p.id === id);

  if (idx === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Plugin not found',
    }, 404);
  }

  const updated = userPlugins.filter((p) => p.id !== id);
  await writePlugins(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});

// PUT /:id/toggle — toggle plugin or sub-item
pluginsRoutes.put('/:id/toggle', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as {
    enabled: boolean;
    itemType?: 'agent' | 'command' | 'rule' | 'mcp';
    itemName?: string;
  };

  if (typeof body.enabled !== 'boolean') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: '"enabled" must be a boolean',
    }, 400);
  }

  const userPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
  const isBuiltIn = BUILTIN_PLUGINS.some((b) => b.id === id);

  // Find existing user record or create override for built-in
  let pluginIdx = userPlugins.findIndex((p) => p.id === id);

  if (pluginIdx === -1 && isBuiltIn) {
    // Create an override entry for the built-in
    const source = BUILTIN_PLUGINS.find((b) => b.id === id)!;
    const override: Plugin = {
      ...source,
      agents: source.agents.map((a) => ({ ...a })),
      commands: source.commands.map((c) => ({ ...c })),
      rules: source.rules.map((r) => ({ ...r })),
    };
    const updated = [...userPlugins, override];
    await writePlugins(c.env.SESSIONS_KV, user.id, updated);
    pluginIdx = updated.length - 1;
    // Re-read so we work with latest
    const freshPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
    return applyToggle(c, freshPlugins, pluginIdx, body);
  }

  if (pluginIdx === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Plugin not found',
    }, 404);
  }

  return applyToggle(c, userPlugins, pluginIdx, body);
});

async function applyToggle(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  plugins: Plugin[],
  idx: number,
  body: { enabled: boolean; itemType?: string; itemName?: string }
) {
  const user = c.get('user');
  const plugin = plugins[idx];

  if (!body.itemType) {
    // Toggle entire plugin
    const updated = plugins.map((p, i) =>
      i === idx ? { ...p, enabled: body.enabled, updatedAt: new Date().toISOString() } : p
    );
    await writePlugins(c.env.SESSIONS_KV, user.id, updated);
    const all = mergeWithBuiltIns(updated);
    const result = all.find((p) => p.id === plugin.id);
    return c.json({ success: true, data: result } as ApiResponse<Plugin>);
  }

  // Toggle specific sub-item
  const categoryMap: Record<string, 'agents' | 'commands' | 'rules'> = {
    agent: 'agents',
    command: 'commands',
    rule: 'rules',
  };

  if (body.itemType === 'mcp') {
    const updated = plugins.map((p, i) => {
      if (i !== idx) return p;
      return {
        ...p,
        updatedAt: new Date().toISOString(),
        mcpServers: p.mcpServers.map((m) =>
          m.name === body.itemName ? { ...m, enabled: body.enabled } : m
        ),
      };
    });
    await writePlugins(c.env.SESSIONS_KV, user.id, updated);
    const all = mergeWithBuiltIns(updated);
    const result = all.find((p) => p.id === plugin.id);
    return c.json({ success: true, data: result } as ApiResponse<Plugin>);
  }

  const category = categoryMap[body.itemType];
  if (!category) {
    return c.json({ success: false, error: 'Invalid itemType' } as ApiResponse<never>, 400);
  }

  const updated = plugins.map((p, i) => {
    if (i !== idx) return p;
    return {
      ...p,
      updatedAt: new Date().toISOString(),
      [category]: (p[category] as PluginItem[]).map((item) =>
        item.name === body.itemName ? { ...item, enabled: body.enabled } : item
      ),
    };
  });

  await writePlugins(c.env.SESSIONS_KV, user.id, updated);
  const all = mergeWithBuiltIns(updated);
  const result = all.find((p) => p.id === plugin.id);
  return c.json({ success: true, data: result } as ApiResponse<Plugin>);
}

// POST /discover — GitHub repo discovery
pluginsRoutes.post('/discover', async (c) => {
  const body = await c.req.json() as { repoUrl: string };

  if (!body.repoUrl || typeof body.repoUrl !== 'string') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'repoUrl is required',
    }, 400);
  }

  // Parse owner/repo from URL
  const match = body.repoUrl.match(
    /github\.com\/([^/]+)\/([^/\s#?]+)/
  );
  if (!match) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid GitHub URL format',
    }, 400);
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  try {
    // Fetch repo tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VaporForge/1.0',
        },
      }
    );

    if (!treeRes.ok) {
      const status = treeRes.status;
      if (status === 404) {
        return c.json<ApiResponse<never>>({
          success: false,
          error: 'Repository not found',
        }, 404);
      }
      if (status === 403) {
        return c.json<ApiResponse<never>>({
          success: false,
          error: 'GitHub API rate limit exceeded',
        }, 429);
      }
      return c.json<ApiResponse<never>>({
        success: false,
        error: `GitHub API error: ${status}`,
      }, 502);
    }

    const tree = await treeRes.json() as {
      tree: Array<{ path: string; type: string }>;
    };

    const agentPaths: string[] = [];
    const commandPaths: string[] = [];
    const rulePaths: string[] = [];
    let readmePath: string | null = null;

    for (const entry of tree.tree) {
      if (entry.type !== 'blob') continue;
      if (entry.path.match(/^\.claude\/agents\/.*\.md$/)) {
        agentPaths.push(entry.path);
      } else if (entry.path.match(/^\.claude\/commands\/.*\.md$/)) {
        commandPaths.push(entry.path);
      } else if (entry.path.match(/^\.claude\/rules\/.*\.md$/)) {
        rulePaths.push(entry.path);
      } else if (entry.path === 'README.md') {
        readmePath = entry.path;
      }
    }

    // Fetch file contents
    async function fetchFileContent(path: string): Promise<string> {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'VaporForge/1.0',
          },
        }
      );
      if (!res.ok) return '';
      const data = await res.json() as { content?: string };
      if (!data.content) return '';
      return atob(data.content.replace(/\n/g, ''));
    }

    const agents: PluginItem[] = [];
    for (const p of agentPaths.slice(0, MAX_ITEMS_PER_CATEGORY)) {
      const content = await fetchFileContent(p);
      const filename = p.split('/').pop() || p;
      const name = filename.replace(/\.md$/, '').replace(/-/g, ' ');
      agents.push({
        name,
        filename,
        content: content.slice(0, MAX_ITEM_CONTENT),
        enabled: true,
      });
    }

    const commands: PluginItem[] = [];
    for (const p of commandPaths.slice(0, MAX_ITEMS_PER_CATEGORY)) {
      const content = await fetchFileContent(p);
      const filename = p.split('/').pop() || p;
      const name = filename.replace(/\.md$/, '').replace(/-/g, ' ');
      commands.push({
        name,
        filename,
        content: content.slice(0, MAX_ITEM_CONTENT),
        enabled: true,
      });
    }

    const rules: PluginItem[] = [];
    for (const p of rulePaths.slice(0, MAX_ITEMS_PER_CATEGORY)) {
      const content = await fetchFileContent(p);
      const filename = p.split('/').pop() || p;
      const name = filename.replace(/\.md$/, '').replace(/-/g, ' ');
      rules.push({
        name,
        filename,
        content: content.slice(0, MAX_ITEM_CONTENT),
        enabled: true,
      });
    }

    let description = `Plugin from ${owner}/${repo}`;
    if (readmePath) {
      const readme = await fetchFileContent(readmePath);
      if (readme) {
        description = readme.slice(0, 500);
      }
    }

    const preview: Plugin = {
      id: `discovered-${crypto.randomUUID()}`,
      name: repo,
      description,
      repoUrl: body.repoUrl,
      scope: 'git' as const,
      enabled: true,
      builtIn: false,
      agents,
      commands,
      rules,
      mcpServers: [],
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return c.json<ApiResponse<Plugin>>({
      success: true,
      data: preview,
    });
  } catch (err) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to discover plugin from repository',
    }, 500);
  }
});

/**
 * Collect all enabled plugin configs for sandbox injection.
 * Returns flat merged lists of agents, commands, rules, and MCP servers
 * from all enabled plugins with enabled items.
 */
export async function collectPluginConfigs(
  kv: KVNamespace,
  userId: string
): Promise<{
  agents: Array<{ filename: string; content: string }>;
  commands: Array<{ filename: string; content: string }>;
  rules: Array<{ filename: string; content: string }>;
  mcpServers: Record<string, Record<string, unknown>>;
}> {
  const userPlugins = await readPlugins(kv, userId);
  const all = mergeWithBuiltIns(userPlugins);
  const enabled = all.filter((p) => p.enabled);

  const agents: Array<{ filename: string; content: string }> = [];
  const commands: Array<{ filename: string; content: string }> = [];
  const rules: Array<{ filename: string; content: string }> = [];
  const mcpServers: Record<string, Record<string, unknown>> = {};

  for (const plugin of enabled) {
    for (const a of plugin.agents) {
      if (a.enabled) {
        agents.push({ filename: a.filename, content: a.content });
      }
    }
    for (const cmd of plugin.commands) {
      if (cmd.enabled) {
        commands.push({ filename: cmd.filename, content: cmd.content });
      }
    }
    for (const r of plugin.rules) {
      if (r.enabled) {
        rules.push({ filename: r.filename, content: r.content });
      }
    }
    for (const mcp of plugin.mcpServers) {
      if (mcp.enabled) {
        const config: Record<string, unknown> = {
          transport: mcp.transport,
        };
        if (mcp.url) config.url = mcp.url;
        if (mcp.command) config.command = mcp.command;
        if (mcp.args) config.args = mcp.args;
        mcpServers[mcp.name] = config;
      }
    }
  }

  return { agents, commands, rules, mcpServers };
}
