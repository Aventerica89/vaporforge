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
  autoUpdate?: boolean;
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
      // True for the fallback synthetic plugin that represents the entire repo
      // at its root. In this case repository_url must be the bare repoUrl so
      // that /plugins/discover looks at the repo root, not at a nonexistent
      // subdirectory whose name happens to match the repo name.
      isRoot?: boolean;
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

  // Fallback: if prefix scan found nothing, try root-level and .claude/ conventions.
  // Treats the whole repo as a single synthetic plugin (repo name = plugin name).
  if (pluginMap.size === 0) {
    const ROOT_PREFIXES = ['', '.claude/'];
    const repoName = repoUrl.split('/').pop() ?? 'plugin';
    const pluginKey = `${sourceId}:${repoName}`;
    const syntheticPlugin = {
      name: repoName,
      prefix: '',
      isRoot: true,
      components: [] as Array<{ type: string; name: string; slug: string }>,
    };

    for (const entry of tree) {
      if (entry.type !== 'blob') continue;
      for (const rp of ROOT_PREFIXES) {
        if (rp && !entry.path.startsWith(rp)) continue;
        const relativePath = rp ? entry.path.slice(rp.length) : entry.path;
        const parts = relativePath.split('/');
        if (parts.length < 2) continue;
        for (const dir of COMPONENT_DIRS) {
          if (parts[0] === dir && parts[parts.length - 1].endsWith('.md')) {
            const fileName = parts[parts.length - 1];
            const compName = fileName.replace('.md', '');
            if (fileName === 'SKILL.md' && parts.length >= 3) {
              const parentName = parts[1];
              if (!syntheticPlugin.components.some((c) => c.type === 'skill' && c.name === parentName)) {
                syntheticPlugin.components.push({ type: 'skill', name: parentName, slug: slugify(parentName) });
              }
            } else {
              syntheticPlugin.components.push({ type: dir.replace(/s$/, ''), name: compName, slug: slugify(compName) });
            }
          }
        }
      }
    }

    if (syntheticPlugin.components.length > 0) {
      pluginMap.set(pluginKey, syntheticPlugin);
    }
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
    // Root-level synthetic plugins represent the entire repo — use the bare
    // repoUrl so that /plugins/discover scans the repo root instead of a
    // nonexistent subdirectory named after the repo.
    const repositoryUrl = info.isRoot
      ? repoUrl
      : `${repoUrl}/tree/${branch}/${pluginPath}`;

    plugins.push({
      id: key,
      source_id: sourceId,
      name: info.name,
      description: null,
      author: null,
      repository_url: repositoryUrl,
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

interface DiscoveryResult {
  plugins: CatalogPluginRuntime[];
  warnings: string[];
}

/**
 * Discover plugins from a single GitHub repo URL.
 * Returns plugins + any warnings (rate limit, not found, no structure match).
 */
async function discoverSourceCatalog(
  source: PluginSource,
  githubToken?: string
): Promise<DiscoveryResult> {
  const parsed = parseGitHubUrl(source.url);
  if (!parsed) return { plugins: [], warnings: ['Invalid GitHub URL'] };

  const { owner, repo, branch, prefixes } = parsed;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const sourceId = `custom:${source.id}`;

  try {
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VaporForge/1.0',
    };
    if (githubToken) ghHeaders['Authorization'] = `token ${githubToken}`;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: ghHeaders }
    );

    if (!treeRes.ok) {
      if (treeRes.status === 403) {
        return { plugins: [], warnings: ['GitHub API rate limited — try again later (60 req/hr unauthenticated)'] };
      }
      if (treeRes.status === 404) {
        return { plugins: [], warnings: [`Repository not found: ${owner}/${repo} (branch: ${branch})`] };
      }
      return { plugins: [], warnings: [`GitHub API error ${treeRes.status}`] };
    }

    const { tree } = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string }>;
    };

    const plugins = parseTreeForPlugins(tree, prefixes, sourceId, repoUrl, branch);

    if (plugins.length === 0) {
      return {
        plugins: [],
        warnings: ['No plugin directories found. This repo may not contain Claude Code plugins, or uses an unsupported structure.'],
      };
    }

    return { plugins, warnings: [] };
  } catch (err) {
    return { plugins: [], warnings: [`Discovery failed: ${err instanceof Error ? err.message : 'Unknown error'}`] };
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

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return c.json({ success: false, error: 'url is required' }, 400);
  }
  // Expand owner/repo shorthand to full GitHub URL
  const url = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(rawUrl)
    ? `https://github.com/${rawUrl}`
    : rawUrl;

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

// PATCH /:id — update source fields (e.g. autoUpdate)
pluginSourcesRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as Partial<Pick<PluginSource, 'autoUpdate' | 'label'>>;

  const sources = await readSources(c.env.SESSIONS_KV, user.id);
  const idx = sources.findIndex((s) => s.id === id);

  if (idx === -1) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }

  const updated: PluginSource = {
    ...sources[idx],
    ...(typeof body.autoUpdate === 'boolean' ? { autoUpdate: body.autoUpdate } : {}),
    ...(typeof body.label === 'string' && body.label.trim() ? { label: body.label.trim() } : {}),
  };

  const updatedSources = sources.map((s, i) => (i === idx ? updated : s));
  await writeSources(c.env.SESSIONS_KV, user.id, updatedSources);

  return c.json({ success: true, data: updated });
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
    sources.map((s) => discoverSourceCatalog(s, c.env.GITHUB_TOKEN))
  );

  const allPlugins = results.flatMap((r) => r.plugins);

  // Collect per-source warnings keyed by source id
  const warnings: Record<string, string[]> = {};
  results.forEach((r, i) => {
    if (r.warnings.length > 0) warnings[sources[i].id] = r.warnings;
  });

  // Cache the results (warnings not cached — they're transient)
  const cacheData = {
    plugins: allPlugins,
    refreshedAt: new Date().toISOString(),
  };
  await c.env.SESSIONS_KV.put(
    cacheKvKey(user.id),
    JSON.stringify(cacheData),
    { expirationTtl: CACHE_TTL_SECONDS }
  );

  return c.json({ success: true, data: { ...cacheData, warnings } });
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
