// Curated catalog of recommended MCP servers
// All HTTP-transport — works instantly from the cloud sandbox

export interface CatalogServer {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly category: 'docs' | 'utility' | 'database' | 'search' | 'security' | 'cloud';
  readonly auth: 'none' | 'oauth' | 'api-key';
  /** Short note shown when auth is required */
  readonly authNote?: string;
}

export const CATEGORY_LABELS: Record<CatalogServer['category'], string> = {
  docs: 'Docs',
  utility: 'Utility',
  database: 'Database',
  search: 'Search',
  security: 'Security',
  cloud: 'Cloud',
};

export const CATEGORY_COLORS: Record<CatalogServer['category'], string> = {
  docs: 'bg-blue-500/10 text-blue-400',
  utility: 'bg-green-500/10 text-green-400',
  database: 'bg-orange-500/10 text-orange-400',
  search: 'bg-purple-500/10 text-purple-400',
  security: 'bg-red-500/10 text-red-400',
  cloud: 'bg-cyan-500/10 text-cyan-400',
};

export const MCP_CATALOG: readonly CatalogServer[] = [
  // --- No auth ---
  {
    name: 'context7',
    url: 'https://mcp.context7.com/mcp',
    description: 'Up-to-date docs for any library or framework',
    category: 'docs',
    auth: 'none',
  },
  {
    name: 'deepwiki',
    url: 'https://mcp.deepwiki.com/mcp',
    description: 'AI-generated docs and architecture for any GitHub repo',
    category: 'docs',
    auth: 'none',
  },
  {
    name: 'fetch',
    url: 'https://remote.mcpservers.org/fetch/mcp',
    description: 'Fetch any URL and convert HTML to markdown',
    category: 'utility',
    auth: 'none',
  },
  {
    name: 'sequential-thinking',
    url: 'https://remote.mcpservers.org/sequentialthinking/mcp',
    description: 'Structured problem-solving through reasoning chains',
    category: 'utility',
    auth: 'none',
  },
  {
    name: 'semgrep',
    url: 'https://mcp.semgrep.ai/sse',
    description: 'Static analysis and code security scanning',
    category: 'security',
    auth: 'none',
  },
  {
    name: 'edgeone-pages',
    url: 'https://remote.mcpservers.org/edgeone-pages/mcp',
    description: 'Deploy HTML to a public URL instantly',
    category: 'utility',
    auth: 'none',
  },
  // --- OAuth / API key ---
  {
    name: 'supabase',
    url: 'https://mcp.supabase.com/mcp',
    description: 'Manage Supabase projects, databases, and auth',
    category: 'database',
    auth: 'oauth',
    authNote: 'OAuth sign-in required',
  },
  {
    name: 'neon',
    url: 'https://mcp.neon.tech/sse',
    description: 'Serverless Postgres — create DBs, run queries, branching',
    category: 'database',
    auth: 'oauth',
    authNote: 'OAuth sign-in required',
  },
  {
    name: 'exa',
    url: 'https://mcp.exa.ai/mcp',
    description: 'AI-native web search, company research, and crawling',
    category: 'search',
    auth: 'none',
    authNote: 'Free credits, no signup',
  },
  {
    name: 'sentry',
    url: 'https://mcp.sentry.dev/sse',
    description: 'Error tracking, performance monitoring, debugging',
    category: 'cloud',
    auth: 'oauth',
    authNote: 'OAuth sign-in required',
  },
  {
    name: 'cloudflare',
    url: 'https://observability.mcp.cloudflare.com/mcp',
    description: 'Workers logs, analytics, and error traces',
    category: 'cloud',
    auth: 'oauth',
    authNote: 'OAuth sign-in required',
  },
];
