import { Hono } from 'hono';
import type { User } from '../types';
import type { SandboxManager } from '../sandbox';

type Variables = {
  user: User;
  sandboxManager: SandboxManager;
};

export interface PluginSource {
  id: string;
  url: string;
  label: string;
  addedAt: string;
}

interface CatalogPluginRuntime {
  id: string;
  source_id: string;
  name: string;
  description: string | null;
  author: string | null;
  repository_url: string;
  categories: string[];
  agent_count: number;
  skill_count: number;
  command_count: number;
  rule_count: number;
  compatibility: 'cloud-ready' | 'relay-required';
  components: Array<{ type: string; name: string; slug: string }>;
}

const MAX_SOURCES = 10;
const CACHE_TTL_SECONDS = 3600; // 1 hour
const COMPONENT_DIRS = ['agents', 'commands', 'skills', 'rules'];

function sourcesKvKey(userId: string): string {
  return `user-plugin-sources:${userId}`;
}

function cacheKvKey(userId: string): string {
  return `user-catalog-cache:${userId}`;
}

async function readSources(kv: KVNamespace, userId: string): Promise<PluginSource[]> {
  const raw = await kv.get(sourcesKvKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSources(
  kv: KVNamespace,
  userId: string,
  sources: PluginSource[]
): Promise<void> {
  await kv.put(sourcesKvKey(userId), JSON.stringify(sources));
}

function slugify(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  prefixes: string[];
} | null {
  const m = url.match(
    /github\.com\/([^/]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/
  );
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const branch = m[3] || 'main';
  const subpath = m[4];

  // If a subpath is provided, use it as prefix
  const prefixes = subpath ? [`${subpath}/`] : ['plugins/', 'external_plugins/'];
  return { owner, repo, branch, prefixes };
}

/**
 * Parse a GitHub tree into CatalogPlugin entries.
 * Mirrors the logic from generate-plugin-catalog.mjs.
 */
function parseTreeForPlugins(
  tree: Array<{ path: string; type: string }>,
  prefixes: string[],
  sourceId: string,
  repoUrl: string,
  branch: string
): CatalogPluginRuntime[] {
  const pluginMap = new Map<
    string,
    {
      name: string;
      prefix: string;
      components: Array<{ type: string; name: string; slug: string }>;
    }
  >();

  for (const entry of tree) {
    if (entry.type !== 'blob') continue;

    for (const prefix of prefixes) {
      if (!entry.path.startsWith(prefix)) continue;

      const rest = entry.path.slice(prefix.length);
      const parts = rest.split('/');
      if (parts.length < 2) continue;

      const pluginName = parts[0];
      const pluginKey = `${sourceId}:${pluginName}`;

      if (!pluginMap.has(pluginKey)) {
        pluginMap.set(pluginKey, {
          name: pluginName,
          prefix,
          components: [],
        });
      }

      const pluginInfo = pluginMap.get(pluginKey)!;

      for (const dir of COMPONENT_DIRS) {
        if (parts[1] === dir && parts.length >= 3) {
          const fileName = parts[parts.length - 1];
          if (fileName.endsWith('.md')) {
            const compName = fileName.replace('.md', '');
            // Handle SKILL.md convention
            if (fileName === 'SKILL.md' && parts.length >= 4) {
              const parentName = parts[2];
              const exists = pluginInfo.components.some(
                (c) => c.type === 'skill' && c.name === parentName
              );
              if (!exists) {
                pluginInfo.components.push({
                  type: 'skill',
                  name: parentName,
                  slug: slugify(parentName),
                });
              }
            } else {
              const type = dir.replace(/s$/, '');
              pluginInfo.components.push({
                type,
                name: compName,
                slug: slugify(compName),
              });
            }
          }
        }
      }
    }
  }

  // Also check for root-level agents/, commands/, rules/ (non-prefixed)
  // This handles repos that have plugin content at the root
  if (prefixes.length === 1 && !prefixes[0].includes('/')) {
    // Already handled by prefix matching
  }

  const plugins: CatalogPluginRuntime[] = [];

  for (const [key, info] of pluginMap.entries()) {
    const agentCount = info.components.filter((c) => c.type === 'agent').length;
    const skillCount = info.components.filter((c) => c.type === 'skill').length;
    const commandCount = info.components.filter((c) => c.type === 'command').length;
    const ruleCount = info.components.filter((c) => c.type === 'rule').length;

    const totalComponents = agentCount + skillCount + commandCount + ruleCount;
    if (totalComponents === 0) continue;

    const pluginPath = `${info.prefix}${info.name}`;

    plugins.push({
      id: key,
      source_id: sourceId,
      name: info.name,
      description: null,
      author: null,
      repository_url: `${repoUrl}/tree/${branch}/${pluginPath}`,
      categories: ['General'],
      agent_count: agentCount,
      skill_count: skillCount,
      command_count: commandCount,
      rule_count: ruleCount,
      compatibility: 'cloud-ready',
      components: info.components,
    });
  }

  return plugins;
}

/**
 * Discover plugins from a single GitHub repo URL.
 * Returns CatalogPlugin[] format for frontend consumption.
 */
async function discoverSourceCatalog(
  source: PluginSource
): Promise<CatalogPluginRuntime[]> {
  const parsed = parseGitHubUrl(source.url);
  if (!parsed) return [];

  const { owner, repo, branch, prefixes } = parsed;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const sourceId = `custom:${source.id}`;

  try {
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VaporForge/1.0',
        },
      }
    );

    if (!treeRes.ok) return [];

    const { tree } = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string }>;
    };

    return parseTreeForPlugins(tree, prefixes, sourceId, repoUrl, branch);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const pluginSourcesRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// GET / — list user's custom sources
pluginSourcesRoutes.get('/', async (c) => {
  const user = c.get('user');
  const sources = await readSources(c.env.SESSIONS_KV, user.id);
  return c.json({ success: true, data: sources });
});

// POST / — add a custom source
pluginSourcesRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as { url?: string; label?: string };

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return c.json({ success: false, error: 'url is required' }, 400);
  }

  // Validate GitHub URL
  if (!parseGitHubUrl(url)) {
    return c.json(
      { success: false, error: 'Invalid GitHub URL format' },
      400
    );
  }

  const sources = await readSources(c.env.SESSIONS_KV, user.id);

  if (sources.length >= MAX_SOURCES) {
    return c.json(
      { success: false, error: `Maximum ${MAX_SOURCES} sources allowed` },
      400
    );
  }

  // Check for duplicates
  if (sources.some((s) => s.url === url)) {
    return c.json(
      { success: false, error: 'Source already exists' },
      400
    );
  }

  // Derive label from URL
  const m = url.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  const defaultLabel = m ? `${m[1]}/${m[2]}` : url;
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim()
    : defaultLabel;

  const source: PluginSource = {
    id: crypto.randomUUID(),
    url,
    label,
    addedAt: new Date().toISOString(),
  };

  const updated = [...sources, source];
  await writeSources(c.env.SESSIONS_KV, user.id, updated);

  // Invalidate cache
  await c.env.SESSIONS_KV.delete(cacheKvKey(user.id));

  return c.json({ success: true, data: source });
});

// DELETE /:id — remove a custom source
pluginSourcesRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const sources = await readSources(c.env.SESSIONS_KV, user.id);
  const filtered = sources.filter((s) => s.id !== id);

  if (filtered.length === sources.length) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }

  await writeSources(c.env.SESSIONS_KV, user.id, filtered);

  // Invalidate cache
  await c.env.SESSIONS_KV.delete(cacheKvKey(user.id));

  return c.json({ success: true, data: { deleted: true } });
});

// POST /refresh — re-discover all sources, return merged catalog
pluginSourcesRoutes.post('/refresh', async (c) => {
  const user = c.get('user');
  const sources = await readSources(c.env.SESSIONS_KV, user.id);

  if (sources.length === 0) {
    return c.json({
      success: true,
      data: { plugins: [], refreshedAt: new Date().toISOString() },
    });
  }

  // Discover all sources in parallel
  const results = await Promise.all(
    sources.map((s) => discoverSourceCatalog(s))
  );
  const allPlugins = results.flat();

  // Cache the results
  const cacheData = {
    plugins: allPlugins,
    refreshedAt: new Date().toISOString(),
  };
  await c.env.SESSIONS_KV.put(
    cacheKvKey(user.id),
    JSON.stringify(cacheData),
    { expirationTtl: CACHE_TTL_SECONDS }
  );

  return c.json({ success: true, data: cacheData });
});

// GET /catalog — get cached custom catalog (or empty)
pluginSourcesRoutes.get('/catalog', async (c) => {
  const user = c.get('user');
  const raw = await c.env.SESSIONS_KV.get(cacheKvKey(user.id));

  if (!raw) {
    return c.json({
      success: true,
      data: { plugins: [], refreshedAt: null },
    });
  }

  try {
    const cached = JSON.parse(raw);
    return c.json({ success: true, data: cached });
  } catch {
    return c.json({
      success: true,
      data: { plugins: [], refreshedAt: null },
    });
  }
});
