import { Hono } from 'hono';
import type { Context } from 'hono';
import type { User, ApiResponse, Plugin, PluginItem } from '../types';
import { PluginSchema, PluginItemSchema, McpServerConfigSchema } from '../types';
import type { SandboxManager } from '../sandbox';
import { collectUserConfigs } from './config';
import { collectMcpConfig } from './mcp';

type Variables = {
  user: User;
  sandboxManager: SandboxManager;
};

export const pluginsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max custom plugins per user */
const MAX_PLUGINS = 50;

/** Max items per category per plugin */
const MAX_ITEMS_PER_CATEGORY = 10;

/** Max content size per item (50KB) */
const MAX_ITEM_CONTENT = 50_000;

/** KV key for a user's plugins list */
function kvKey(userId: string): string {
  return `user-plugins:${userId}`;
}

// ---------------------------------------------------------------------------
// Built-in command templates — rich prompts sent to the Claude SDK
// ---------------------------------------------------------------------------

const REVIEW_AGENT_CONTENT = [
  'You are an expert code review agent.',
  'Review code for quality, security, performance, and maintainability.',
  '',
  'For every issue found, provide:',
  '1. Severity: CRITICAL / HIGH / MEDIUM / LOW',
  '2. File and line reference',
  '3. What the problem is',
  '4. A concrete fix (code snippet)',
  '',
  'Check for: security vulnerabilities (OWASP Top 10), race conditions,',
  'memory leaks, error handling gaps, type safety, naming clarity,',
  'dead code, and adherence to project conventions.',
].join('\n');

const REVIEW_CMD_CONTENT = [
  'Review the code in this workspace for quality, security, and best practices.',
  '',
  'Follow this process:',
  '1. Read the project structure to understand the tech stack and conventions.',
  '2. Identify recently changed or active files (check git status if available).',
  '3. Review each file for:',
  '   - Security vulnerabilities (injection, XSS, auth bypass, secrets in code)',
  '   - Logic errors and edge cases',
  '   - Error handling gaps (unhandled promises, empty catches, missing validation)',
  '   - Performance issues (N+1 queries, unnecessary re-renders, large bundles)',
  '   - Code quality (naming, duplication, complexity, dead code)',
  '   - Type safety issues',
  '4. Output a structured report grouped by severity:',
  '   - CRITICAL: Must fix before deploy (security, data loss)',
  '   - HIGH: Should fix soon (logic errors, bad error handling)',
  '   - MEDIUM: Improve when possible (code quality, performance)',
  '   - LOW: Nice to have (style, minor naming)',
  '',
  'For each issue, include the file path, line number, description,',
  'and a concrete code fix. End with a summary of the overall health.',
].join('\n');

const TEST_AGENT_CONTENT = [
  'You are an expert test writing agent.',
  'Generate comprehensive unit and integration tests.',
  'Follow TDD principles. Target 80%+ coverage.',
  '',
  'For each test:',
  '- Use descriptive test names that explain the expected behavior',
  '- Follow the Arrange-Act-Assert pattern',
  '- Test both happy paths and error cases',
  '- Mock external dependencies, not internal logic',
  '- Include edge cases: empty inputs, boundary values, null/undefined',
].join('\n');

const TEST_CMD_CONTENT = [
  'Generate comprehensive tests for the code in this workspace.',
  '',
  'Follow this process:',
  '1. Identify the testing framework already in use (vitest, jest, playwright, etc.).',
  '   If none exists, recommend one appropriate for the stack.',
  '2. Find the key modules, functions, and components to test.',
  '3. For each, generate tests covering:',
  '   - Happy path: normal expected behavior',
  '   - Edge cases: empty inputs, boundary values, large inputs',
  '   - Error cases: invalid input, network failures, missing data',
  '   - Integration: how components work together',
  '4. Use descriptive test names: "should return empty array when no items match"',
  '5. Follow Arrange-Act-Assert pattern in each test.',
  '6. Mock external services (APIs, databases) but not internal logic.',
  '7. Aim for 80%+ code coverage on critical paths.',
  '',
  'Write the actual test files with proper imports and setup.',
  'Include setup/teardown if needed. Run the tests to verify they pass.',
].join('\n');

const DOCS_AGENT_CONTENT = [
  'You are an expert documentation agent.',
  'Write clear, accurate, developer-focused documentation.',
  '',
  'Documentation should be:',
  '- Scannable: use headings, lists, and code blocks',
  '- Practical: include working examples for every concept',
  '- Current: match the actual code, not aspirational behavior',
  '- Concise: no filler, every sentence adds value',
].join('\n');

const DOCS_CMD_CONTENT = [
  'Generate or update documentation for this project.',
  '',
  'Follow this process:',
  '1. Read the project structure, package.json, and existing README.',
  '2. Understand the tech stack, entry points, and key modules.',
  '3. Generate documentation covering:',
  '   - Overview: what the project does in 2-3 sentences',
  '   - Quick Start: how to install, configure, and run locally',
  '   - Architecture: key files/folders and how they connect',
  '   - API Reference: endpoints, parameters, response shapes',
  '   - Configuration: env vars, config files, feature flags',
  '   - Common Tasks: how to add a feature, run tests, deploy',
  '4. Use code blocks with language tags for all examples.',
  '5. Keep it practical — working examples over abstract descriptions.',
  '',
  'If a README already exists, update it rather than replacing it.',
  'Preserve any existing sections the user has customized.',
].join('\n');

const REFACTOR_AGENT_CONTENT = [
  'You are an expert refactoring agent.',
  'Improve code structure without changing external behavior.',
  '',
  'Focus areas:',
  '- Extract repeated code into shared functions',
  '- Simplify complex conditionals and nested logic',
  '- Improve naming for clarity',
  '- Apply SOLID principles where they reduce complexity',
  '- Remove dead code and unused imports',
  '',
  'Rules: never change public APIs or behavior.',
  'Every refactor must be verifiable by existing tests.',
].join('\n');

const REFACTOR_CMD_CONTENT = [
  'Refactor the code in this workspace for better structure and maintainability.',
  '',
  'Follow this process:',
  '1. Read the codebase and identify the areas with the most technical debt.',
  '2. Prioritize refactoring by impact:',
  '   - Duplicated code that can be extracted into shared functions',
  '   - Complex functions (>50 lines or >4 levels of nesting)',
  '   - God files (>500 lines) that should be split',
  '   - Unclear naming that requires reading the implementation to understand',
  '   - Dead code: unused functions, imports, variables',
  '   - Inconsistent patterns across similar modules',
  '3. For each refactor:',
  '   - Explain what you are changing and why',
  '   - Ensure external behavior is preserved',
  '   - Verify existing tests still pass after the change',
  '4. Make changes incrementally — one logical refactor per step.',
  '',
  'Do NOT add new features or change any public API.',
  'Focus purely on internal code quality improvements.',
].join('\n');

const MCP_SERVERS_CMD_CONTENT = [
  'Show the user their configured MCP servers.',
  '',
  'Instructions (follow exactly):',
  '1. Read the file /root/.claude.json',
  '2. Parse the "mcpServers" key from the JSON.',
  '3. Present a clean, formatted list of every server:',
  '   - Name (the key)',
  '   - Transport type (stdio, http, sse)',
  '   - URL or command',
  '   - Whether it appears reachable from this sandbox',
  '     (local URLs like 127.0.0.1 are NOT reachable)',
  '4. Show the total count.',
  '',
  'Do NOT search the filesystem or run discovery commands.',
  'The config is ONLY in /root/.claude.json — read it directly.',
  'If the file does not exist, tell the user no MCP servers are configured.',
].join('\n');

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
      content: REVIEW_AGENT_CONTENT,
      enabled: true,
    }],
    commands: [{
      name: 'Review',
      filename: 'review.md',
      content: REVIEW_CMD_CONTENT,
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
      content: TEST_AGENT_CONTENT,
      enabled: true,
    }],
    commands: [{
      name: 'Test',
      filename: 'test.md',
      content: TEST_CMD_CONTENT,
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
      content: DOCS_AGENT_CONTENT,
      enabled: true,
    }],
    commands: [{
      name: 'Docs',
      filename: 'docs.md',
      content: DOCS_CMD_CONTENT,
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
      content: REFACTOR_AGENT_CONTENT,
      enabled: true,
    }],
    commands: [{
      name: 'Refactor',
      filename: 'refactor.md',
      content: REFACTOR_CMD_CONTENT,
      enabled: true,
    }],
    rules: [],
    mcpServers: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-mcp-servers',
    name: 'MCP Servers',
    description: '/mcp-servers command to list configured MCP servers',
    scope: 'local' as const,
    enabled: true,
    builtIn: true,
    agents: [],
    commands: [{
      name: 'mcp-servers',
      filename: 'mcp-servers.md',
      content: MCP_SERVERS_CMD_CONTENT,
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
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Invalid plugin data — ${detail}`,
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
// Supports three directory structures:
// 1. Monorepo subdir: github.com/owner/repo/tree/branch/path/to/plugin
//    -> look for agents/, commands/, skills/ under that subpath
// 2. Plugin root: agents/, commands/, rules/, skills/ at repo root
// 3. Claude convention: .claude/agents/, .claude/commands/, .claude/rules/
pluginsRoutes.post('/discover', async (c) => {
  const body = await c.req.json() as { repoUrl: string };

  if (!body.repoUrl || typeof body.repoUrl !== 'string') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'repoUrl is required',
    }, 400);
  }

  // Parse owner/repo and optional subpath from URL
  // Matches: github.com/owner/repo or github.com/owner/repo/tree/branch/sub/path
  const fullMatch = body.repoUrl.match(
    /github\.com\/([^/]+)\/([^/\s#?]+)(?:\/tree\/[^/]+\/(.+))?/
  );
  if (!fullMatch) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid GitHub URL format',
    }, 400);
  }

  const owner = fullMatch[1];
  const repo = fullMatch[2].replace(/\.git$/, '');
  const subPath = fullMatch[3] || ''; // e.g. "plugins/agent-sdk-dev"

  try {
    // Fetch repo tree
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VaporForge/1.0',
    };
    if (c.env.GITHUB_TOKEN) ghHeaders['Authorization'] = `Bearer ${c.env.GITHUB_TOKEN}`;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers: ghHeaders }
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

    // Build base prefix for path matching
    const base = subPath ? `${subPath}/` : '';

    const agentPaths: string[] = [];
    const commandPaths: string[] = [];
    const rulePaths: string[] = [];
    let readmePath: string | null = null;

    for (const entry of tree.tree) {
      if (entry.type !== 'blob') continue;

      // Only consider files under the subpath (if specified)
      if (base && !entry.path.startsWith(base)) continue;

      // Strip base prefix for pattern matching
      const relative = base ? entry.path.slice(base.length) : entry.path;

      // Match agents: agents/*.md or .claude/agents/*.md
      if (relative.match(/^agents\/[^/]+\.md$/)) {
        agentPaths.push(entry.path);
      } else if (relative.match(/^\.claude\/agents\/[^/]+\.md$/)) {
        agentPaths.push(entry.path);
      }

      // Match commands: commands/*.md or .claude/commands/*.md
      if (relative.match(/^commands\/[^/]+\.md$/)) {
        commandPaths.push(entry.path);
      } else if (relative.match(/^\.claude\/commands\/[^/]+\.md$/)) {
        commandPaths.push(entry.path);
      }

      // Match skills as commands (Claude plugins use skills/ for commands)
      // Supports nested: skills/playground/SKILL.md, skills/playground/templates/*.md
      if (relative.match(/^skills\/.+\.md$/)) {
        commandPaths.push(entry.path);
      }

      // Match rules: rules/*.md or .claude/rules/*.md
      if (relative.match(/^rules\/[^/]+\.md$/)) {
        rulePaths.push(entry.path);
      } else if (relative.match(/^\.claude\/rules\/[^/]+\.md$/)) {
        rulePaths.push(entry.path);
      }

      // README at the plugin root (not nested READMEs)
      if (relative === 'README.md') {
        readmePath = entry.path;
      }
    }

    // Fetch file contents
    async function fetchFileContent(path: string): Promise<string> {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers: ghHeaders }
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
      const name = filename.replace(/\.md$/, '');
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
      // Keep dashes for slash-command-friendly names (/code-map not /code map)
      let name = filename.replace(/\.md$/, '');
      // SKILL.md is Claude's convention for skill entry points — use parent dir name
      if (filename === 'SKILL.md') {
        const parts = p.split('/');
        if (parts.length >= 2) name = parts[parts.length - 2];
      }
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
      const name = filename.replace(/\.md$/, '');
      rules.push({
        name,
        filename,
        content: content.slice(0, MAX_ITEM_CONTENT),
        enabled: true,
      });
    }

    // Determine plugin name from subpath or repo name
    const pluginName = subPath
      ? subPath.split('/').pop() || repo
      : repo;

    let description = `Plugin from ${owner}/${repo}`;
    if (readmePath) {
      const readme = await fetchFileContent(readmePath);
      if (readme) {
        description = readme.slice(0, 500);
      }
    }

    const preview: Plugin = {
      id: `discovered-${crypto.randomUUID()}`,
      name: pluginName,
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

// ---------------------------------------------------------------------------
// Shared discovery helper — reusable for refresh endpoint
// ---------------------------------------------------------------------------

async function discoverPluginContent(
  repoUrl: string,
  githubToken?: string
): Promise<{
  name: string;
  description: string;
  agents: PluginItem[];
  commands: PluginItem[];
  rules: PluginItem[];
} | null> {
  const m = repoUrl.match(
    /github\.com\/([^/]+)\/([^/\s#?]+)(?:\/tree\/[^/]+\/(.+))?/
  );
  if (!m) return null;
  const [, owner, rawRepo, subPath = ''] = m;
  const repo = rawRepo.replace(/\.git$/, '');

  try {
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VaporForge/1.0',
    };
    if (githubToken) ghHeaders['Authorization'] = `token ${githubToken}`;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers: ghHeaders }
    );
    if (!treeRes.ok) return null;

    const { tree } = await treeRes.json() as {
      tree: Array<{ path: string; type: string }>;
    };

    const base = subPath ? `${subPath}/` : '';
    const agentPaths: string[] = [];
    const commandPaths: string[] = [];
    const rulePaths: string[] = [];
    let readmePath: string | null = null;

    for (const e of tree) {
      if (e.type !== 'blob') continue;
      if (base && !e.path.startsWith(base)) continue;
      const rel = base ? e.path.slice(base.length) : e.path;

      if (/^(?:\.claude\/)?agents\/[^/]+\.md$/.test(rel)) {
        agentPaths.push(e.path);
      }
      if (/^(?:\.claude\/)?commands\/[^/]+\.md$/.test(rel)) {
        commandPaths.push(e.path);
      }
      // Supports nested: skills/playground/SKILL.md, skills/*/templates/*.md
      if (/^skills\/.+\.md$/.test(rel)) {
        commandPaths.push(e.path);
      }
      if (/^(?:\.claude\/)?rules\/[^/]+\.md$/.test(rel)) {
        rulePaths.push(e.path);
      }
      if (rel === 'README.md') readmePath = e.path;
    }

    const fetchContent = async (path: string): Promise<string> => {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers: ghHeaders }
      );
      if (!res.ok) return '';
      const d = await res.json() as { content?: string };
      return d.content ? atob(d.content.replace(/\n/g, '')) : '';
    };

    const buildItems = async (paths: string[]): Promise<PluginItem[]> => {
      const items: PluginItem[] = [];
      for (const p of paths.slice(0, MAX_ITEMS_PER_CATEGORY)) {
        const content = await fetchContent(p);
        const filename = p.split('/').pop() || p;
        // Keep dashes for slash-command-friendly names (/code-map not /code map)
        let name = filename.replace(/\.md$/, '');
        // SKILL.md is Claude's convention for skill entry points — use parent dir name
        if (filename === 'SKILL.md') {
          const parts = p.split('/');
          if (parts.length >= 2) name = parts[parts.length - 2];
        }
        items.push({
          name,
          filename,
          content: content.slice(0, MAX_ITEM_CONTENT),
          enabled: true,
        });
      }
      return items;
    };

    const agents = await buildItems(agentPaths);
    const commands = await buildItems(commandPaths);
    const rules = await buildItems(rulePaths);

    const pluginName = subPath
      ? subPath.split('/').pop() || repo
      : repo;

    let description = `Plugin from ${owner}/${repo}`;
    if (readmePath) {
      const readme = await fetchContent(readmePath);
      if (readme) description = readme.slice(0, 500);
    }

    return { name: pluginName, description, agents, commands, rules };
  } catch {
    return null;
  }
}

/** Merge fresh items into existing, preserving user's enabled states */
function mergeItems(
  existing: PluginItem[],
  fresh: PluginItem[]
): PluginItem[] {
  const enabledMap = new Map(
    existing.map((i) => [i.filename, i.enabled])
  );
  return fresh.map((i) => ({
    ...i,
    enabled: enabledMap.get(i.filename) ?? true,
  }));
}

// POST /refresh — re-discover all git-sourced plugins with latest content
pluginsRoutes.post('/refresh', async (c) => {
  const user = c.get('user');
  const userPlugins = await readPlugins(c.env.SESSIONS_KV, user.id);
  const updated = [...userPlugins];
  let refreshedCount = 0;

  for (let i = 0; i < updated.length; i++) {
    const plugin = updated[i];
    if (plugin.builtIn || !plugin.repoUrl) continue;

    const discovered = await discoverPluginContent(plugin.repoUrl, c.env.GITHUB_TOKEN);
    if (!discovered) continue;

    const hasContent = discovered.agents.length > 0
      || discovered.commands.length > 0
      || discovered.rules.length > 0;
    if (!hasContent) continue;

    updated[i] = {
      ...plugin,
      agents: mergeItems(plugin.agents, discovered.agents),
      commands: mergeItems(plugin.commands, discovered.commands),
      rules: mergeItems(plugin.rules, discovered.rules),
      updatedAt: new Date().toISOString(),
    };
    refreshedCount++;
  }

  await writePlugins(c.env.SESSIONS_KV, user.id, updated);
  const all = mergeWithBuiltIns(updated);

  return c.json<ApiResponse<{ refreshed: number; plugins: Plugin[] }>>({
    success: true,
    data: { refreshed: refreshedCount, plugins: all },
  });
});

// POST /sync/:sessionId — push current plugins into an active sandbox
pluginsRoutes.post('/sync/:sessionId', async (c) => {
  const user = c.get('user');
  const sandboxManager = c.get('sandboxManager');
  const { sessionId } = c.req.param();

  // Verify session ownership + ensure sandbox is alive
  const session = await sandboxManager.getOrWakeSandbox(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Session not found',
    }, 404);
  }

  try {
    // Collect current plugin + user configs from KV
    const pluginConfigs = await collectPluginConfigs(c.env.SESSIONS_KV, user.id);
    const userConfigs = await collectUserConfigs(c.env.SESSIONS_KV, user.id);

    // Inject into sandbox (clear + rewrite plugin files, then user configs)
    await sandboxManager.injectPluginFiles(sessionId, pluginConfigs);
    await sandboxManager.injectUserConfigs(sessionId, userConfigs);

    // Update KV MCP config so future SDK calls pick up the latest servers
    const userMcpServers = await collectMcpConfig(c.env.SESSIONS_KV, user.id);
    const allMcpServers = {
      ...(userMcpServers || {}),
      ...(pluginConfigs.mcpServers || {}),
    };
    if (Object.keys(allMcpServers).length > 0) {
      await c.env.SESSIONS_KV.put(
        `session-mcp:${sessionId}`,
        JSON.stringify(allMcpServers),
        { expirationTtl: 7 * 24 * 60 * 60 }
      );
    }

    return c.json<ApiResponse<{ synced: boolean }>>({
      success: true,
      data: { synced: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return c.json<ApiResponse<never>>({
      success: false,
      error: msg,
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
