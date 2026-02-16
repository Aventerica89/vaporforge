export interface ParsedServer {
  name: string;
  transport: 'http' | 'stdio' | 'relay';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface ParseResult {
  success: boolean;
  servers: ParsedServer[];
  error?: string;
}

/**
 * Parse MCP server config JSON from various formats.
 *
 * Supports:
 * 1. Wrapped: { "mcpServers": { "name": { ... } } }
 * 2. Single named: { "name": "foo", "url": "..." }
 * 3. Single unnamed: { "url": "..." } or { "command": "..." }
 */
export function parseMcpConfig(input: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.trim());
  } catch {
    return { success: false, servers: [], error: 'Invalid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, servers: [], error: 'Expected a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // Format 1: Wrapped — { mcpServers: { name: config } }
  if (
    'mcpServers' in obj &&
    typeof obj.mcpServers === 'object' &&
    obj.mcpServers !== null
  ) {
    const entries = Object.entries(
      obj.mcpServers as Record<string, unknown>
    );
    if (entries.length === 0) {
      return { success: false, servers: [], error: 'No servers found in mcpServers' };
    }

    const servers: ParsedServer[] = [];
    for (const [name, config] of entries) {
      if (typeof config !== 'object' || config === null) continue;
      const server = extractServer(name, config as Record<string, unknown>);
      if (server) servers.push(server);
    }

    if (servers.length === 0) {
      return { success: false, servers: [], error: 'Could not parse any valid servers' };
    }
    return { success: true, servers };
  }

  // Format 2: Single named — { name: "foo", url: "..." }
  if ('name' in obj && typeof obj.name === 'string') {
    const server = extractServer(obj.name as string, obj);
    if (!server) {
      return {
        success: false,
        servers: [],
        error: 'Could not determine transport from config',
      };
    }
    return { success: true, servers: [server] };
  }

  // Format 3: Single unnamed — { url: "..." } or { command: "..." }
  const server = extractServer('', obj);
  if (!server) {
    return {
      success: false,
      servers: [],
      error: 'Could not determine transport from config',
    };
  }
  return { success: true, servers: [server] };
}

function extractServer(
  name: string,
  config: Record<string, unknown>
): ParsedServer | null {
  const headers = extractRecord(config.headers);
  const env = extractRecord(config.env);

  // HTTP: has url or type=http
  if (config.url && typeof config.url === 'string') {
    return { name, transport: 'http', url: config.url, headers };
  }

  // stdio: has command
  if (config.command && typeof config.command === 'string') {
    const args = Array.isArray(config.args)
      ? config.args.filter((a): a is string => typeof a === 'string')
      : undefined;
    return { name, transport: 'stdio', command: config.command, args, env };
  }

  return null;
}

function extractRecord(
  value: unknown
): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  let hasEntries = false;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      result[k] = v;
      hasEntries = true;
    }
  }
  return hasEntries ? result : undefined;
}

/** Validate a server name (alphanumeric, dashes, underscores) */
export function isValidServerName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.length >= 1 && name.length <= 100;
}
