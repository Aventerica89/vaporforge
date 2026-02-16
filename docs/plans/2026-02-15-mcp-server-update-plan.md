# MCP Server Management Update — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add paste-to-add JSON config, custom headers, env vars, and tool discovery to VaporForge's MCP server settings.

**Architecture:** Extend the existing McpServerConfig schema with 4 optional fields (headers, env, tools, toolCount). Add a frontend JSON parser module for multi-format paste detection. Enhance the ping endpoint to query MCP tools. Update the McpTab UI with a paste modal, key-value editors, and tool pill display.

**Tech Stack:** React 18, Tailwind v3.4, Hono, Cloudflare KV, Zod, Vitest

---

### Task 1: Extend McpServerConfig Schema (Backend)

**Files:**
- Modify: `src/types.ts:200-213`

**Step 1: Add new optional fields to McpServerConfigSchema**

Open `src/types.ts` and find the `McpServerConfigSchema` definition (line 200). Add 4 new optional fields after `localUrl`:

```typescript
export const McpServerConfigSchema = z.object({
  name: z.string().min(1).max(100).regex(
    /^[a-zA-Z0-9_-]+$/,
    'Name must be alphanumeric, dashes, or underscores'
  ),
  transport: z.enum(['http', 'stdio', 'relay']),
  url: z.string().url().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  /** Local URL for relay transport (e.g. http://localhost:9222) */
  localUrl: z.string().url().optional(),
  /** HTTP headers for auth (e.g. { Authorization: "Bearer ..." }) */
  headers: z.record(z.string()).optional(),
  /** Env vars for stdio servers (e.g. { GITHUB_TOKEN: "ghp_..." }) */
  env: z.record(z.string()).optional(),
  /** Cached tool names from last ping (display only) */
  tools: z.array(z.string()).optional(),
  /** Total tool count from last ping */
  toolCount: z.number().optional(),
  enabled: z.boolean().default(true),
  addedAt: z.string(),
});
```

**Step 2: Verify types build**

Run: `cd /Users/jb/vaporforge && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors related to McpServerConfig

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(mcp): add headers, env, tools, toolCount to schema"
```

---

### Task 2: Extend McpServerConfig (Frontend Types)

**Files:**
- Modify: `ui/src/lib/types.ts:121-131`

**Step 1: Add matching fields to frontend McpServerConfig interface**

Open `ui/src/lib/types.ts` and find the `McpServerConfig` interface (line 121). Add the same 4 fields:

```typescript
export interface McpServerConfig {
  name: string;
  transport: 'http' | 'stdio' | 'relay';
  url?: string;
  command?: string;
  args?: string[];
  /** Local URL for relay transport (e.g. http://localhost:9222) */
  localUrl?: string;
  /** HTTP headers for auth (e.g. { Authorization: "Bearer ..." }) */
  headers?: Record<string, string>;
  /** Env vars for stdio servers (e.g. { GITHUB_TOKEN: "ghp_..." }) */
  env?: Record<string, string>;
  /** Cached tool names from last ping (display only) */
  tools?: string[];
  /** Total tool count from last ping */
  toolCount?: number;
  enabled: boolean;
  addedAt: string;
}
```

**Step 2: Verify frontend builds**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add ui/src/lib/types.ts
git commit -m "feat(mcp): mirror schema fields in frontend types"
```

---

### Task 3: Update Backend — Accept and Pass Through Headers/Env

**Files:**
- Modify: `src/api/mcp.ts:58-135` (POST handler)
- Modify: `src/api/mcp.ts:197-227` (collectMcpConfig)

**Step 1: Update POST handler to accept headers and env**

In `src/api/mcp.ts`, the POST route (line 58) uses `McpServerConfigSchema.omit({ addedAt, enabled })`. Since the new fields are already optional in the schema, they'll pass through Zod automatically. But we need to include them in the `newServer` object.

Find the `newServer` construction (line 117) and add headers/env:

```typescript
  const newServer: McpServerConfig = {
    name,
    transport,
    url,
    command,
    args,
    localUrl,
    headers: parsed.data.headers,
    env: parsed.data.env,
    enabled: true,
    addedAt: new Date().toISOString(),
  };
```

Also update the destructuring on line 75 to include the new fields:

```typescript
  const { name, transport, url, command, args, localUrl, headers, env } = parsed.data;
```

**Step 2: Update collectMcpConfig to pass headers/env**

Find `collectMcpConfig` (line 197). Update the HTTP and stdio branches:

```typescript
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
      result[server.name] = {
        type: 'http',
        url: `http://127.0.0.1:9788/mcp/${server.name}`,
      };
    }
  }
```

**Step 3: Verify build**

Run: `cd /Users/jb/vaporforge && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/api/mcp.ts
git commit -m "feat(mcp): accept headers/env in POST, pass through to SDK config"
```

---

### Task 4: Enhance Ping to Discover Tools

**Files:**
- Modify: `src/api/mcp.ts:229-275` (batch ping)
- Modify: `src/api/mcp.ts:277-315` (single ping)

**Step 1: Add tool discovery to single ping**

After a successful health check (server responds), make an MCP `initialize` + `tools/list` request. MCP servers expose tools via JSON-RPC over HTTP POST.

Add a helper function above the ping routes:

```typescript
/** Query an MCP server for its available tools via JSON-RPC */
async function discoverTools(
  url: string,
  headers?: Record<string, string>
): Promise<{ tools: string[]; toolCount: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    // MCP uses JSON-RPC — send tools/list request
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
```

**Step 2: Update single ping to cache tools**

In the `/:name/ping` route (line 278), after a successful health check, call `discoverTools` and update the KV entry:

```typescript
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
```

**Step 3: Update batch ping to also pass headers**

In the batch ping route (line 230), update the fetch call to include headers:

```typescript
const res = await fetch(server.url!, {
  method: 'GET',
  headers: server.headers || {},
  signal: controller.signal,
});
```

**Step 4: Verify build**

Run: `cd /Users/jb/vaporforge && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 5: Commit**

```bash
git add src/api/mcp.ts
git commit -m "feat(mcp): discover tools via JSON-RPC on ping, cache to KV"
```

---

### Task 5: Create JSON Config Parser

**Files:**
- Create: `ui/src/lib/mcp-config-parser.ts`

**Step 1: Create the parser module**

Create `ui/src/lib/mcp-config-parser.ts`:

```typescript
import type { McpServerConfig } from './types';

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
  if ('mcpServers' in obj && typeof obj.mcpServers === 'object' && obj.mcpServers !== null) {
    const entries = Object.entries(obj.mcpServers as Record<string, unknown>);
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
      return { success: false, servers: [], error: 'Could not determine transport from config' };
    }
    return { success: true, servers: [server] };
  }

  // Format 3: Single unnamed — { url: "..." } or { command: "..." }
  const server = extractServer('', obj);
  if (!server) {
    return { success: false, servers: [], error: 'Could not determine transport from config' };
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
    return {
      name,
      transport: 'http',
      url: config.url,
      headers,
    };
  }

  // stdio: has command
  if (config.command && typeof config.command === 'string') {
    const args = Array.isArray(config.args)
      ? config.args.filter((a): a is string => typeof a === 'string')
      : undefined;
    return {
      name,
      transport: 'stdio',
      command: config.command,
      args,
      env,
    };
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
```

**Step 2: Verify build**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds (new file, no references yet)

**Step 3: Commit**

```bash
git add ui/src/lib/mcp-config-parser.ts
git commit -m "feat(mcp): add multi-format JSON config parser"
```

---

### Task 6: Add mcpApi.addBatch to Frontend API Client

**Files:**
- Modify: `ui/src/lib/api.ts:603-634`

**Step 1: Add addBatch method**

In `ui/src/lib/api.ts`, find the `mcpApi` object (line 603). Add a new method after `add`:

```typescript
export const mcpApi = {
  list: () =>
    request<McpServerConfig[]>('/mcp'),

  add: (server: Omit<McpServerConfig, 'addedAt' | 'enabled'>) =>
    request<McpServerConfig>('/mcp', {
      method: 'POST',
      body: JSON.stringify(server),
    }),

  /** Add multiple servers sequentially, return results per server */
  addBatch: async (
    servers: Array<Omit<McpServerConfig, 'addedAt' | 'enabled'>>
  ): Promise<{ added: string[]; failed: Array<{ name: string; error: string }> }> => {
    const added: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const server of servers) {
      const result = await request<McpServerConfig>('/mcp', {
        method: 'POST',
        body: JSON.stringify(server),
      });
      if (result.success) {
        added.push(server.name);
      } else {
        failed.push({ name: server.name, error: result.error || 'Failed' });
      }
    }
    return { added, failed };
  },

  remove: (name: string) =>
    request<{ deleted: boolean }>(`/mcp/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  toggle: (name: string) =>
    request<McpServerConfig>(`/mcp/${encodeURIComponent(name)}/toggle`, {
      method: 'PUT',
    }),

  ping: () =>
    request<Record<string, { status: string; httpStatus?: number; tools?: string[]; toolCount?: number }>>('/mcp/ping', {
      method: 'POST',
    }),

  pingOne: (name: string) =>
    request<{ status: string; httpStatus?: number; tools?: string[]; toolCount?: number }>(`/mcp/${encodeURIComponent(name)}/ping`, {
      method: 'POST',
    }),
};
```

Note: also update `ping` and `pingOne` return types to include `tools` and `toolCount`.

**Step 2: Verify build**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add ui/src/lib/api.ts
git commit -m "feat(mcp): add addBatch method + tools in ping response types"
```

---

### Task 7: Update McpTab — Key-Value Editor Component

**Files:**
- Modify: `ui/src/components/settings/McpTab.tsx`

This task adds a reusable `KeyValueEditor` component inside McpTab for both headers and env vars.

**Step 1: Add KeyValueEditor component**

Add this component inside `McpTab.tsx`, above the `CatalogSection` component (before line 90):

```tsx
function KeyValueEditor({
  entries,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  entries: Array<{ key: string; value: string }>;
  onChange: (entries: Array<{ key: string; value: string }>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const [showValues, setShowValues] = useState(false);

  const handleAdd = () => {
    onChange([...entries, { key: '', value: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'key' | 'value', val: string) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setShowValues((p) => !p)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showValues ? 'Hide values' : 'Show values'}
          </button>
        )}
      </div>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={entry.key}
            onChange={(e) => handleChange(i, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
          />
          <input
            type={showValues ? 'text' : 'password'}
            value={entry.value}
            onChange={(e) => handleChange(i, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-[2] rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleRemove(i)}
            className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Add headers/env state to the add form**

In the `McpTab` component, find the state declarations (around line 236-249). Add:

```typescript
const [headerEntries, setHeaderEntries] = useState<Array<{ key: string; value: string }>>([]);
const [envEntries, setEnvEntries] = useState<Array<{ key: string; value: string }>>([]);
```

Update `resetForm` (line 285) to also reset these:

```typescript
const resetForm = () => {
  setName('');
  setUrl('');
  setLocalUrl('');
  setCommand('');
  setError('');
  setNameError('');
  setTransport('http');
  setHeaderEntries([]);
  setEnvEntries([]);
  setShowAdd(false);
};
```

**Step 3: Add KeyValueEditor to the add form**

After the transport-specific input section (after line ~569, before the error display), add:

```tsx
{/* Headers (HTTP only) */}
{transport === 'http' && (
  <div>
    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
      Headers <span className="text-muted-foreground/50">(optional)</span>
    </label>
    <KeyValueEditor
      entries={headerEntries}
      onChange={setHeaderEntries}
      keyPlaceholder="Authorization"
      valuePlaceholder="Bearer sk-..."
    />
  </div>
)}

{/* Env Vars (stdio only) */}
{transport === 'stdio' && (
  <div>
    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
      Environment Variables <span className="text-muted-foreground/50">(optional)</span>
    </label>
    <KeyValueEditor
      entries={envEntries}
      onChange={setEnvEntries}
      keyPlaceholder="GITHUB_TOKEN"
      valuePlaceholder="ghp_..."
    />
  </div>
)}
```

**Step 4: Include headers/env in handleAdd**

Update the `handleAdd` function (line 302) to include headers and env:

```typescript
const handleAdd = async () => {
  // ... existing validation ...

  const server: Record<string, unknown> = { name, transport };

  if (transport === 'http') {
    server.url = url;
    const headers = entriesToRecord(headerEntries);
    if (headers) server.headers = headers;
  } else if (transport === 'stdio') {
    const parts = command.trim().split(/\s+/);
    server.command = parts[0];
    if (parts.length > 1) server.args = parts.slice(1);
    const env = entriesToRecord(envEntries);
    if (env) server.env = env;
  } else if (transport === 'relay') {
    server.localUrl = localUrl;
  }

  // ... rest of existing handleAdd ...
};
```

Add the helper function near the top of the file:

```typescript
function entriesToRecord(
  entries: Array<{ key: string; value: string }>
): Record<string, string> | undefined {
  const filtered = entries.filter((e) => e.key.trim() && e.value.trim());
  if (filtered.length === 0) return undefined;
  return Object.fromEntries(filtered.map((e) => [e.key.trim(), e.value]));
}
```

**Step 5: Verify build**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add ui/src/components/settings/McpTab.tsx
git commit -m "feat(mcp): add key-value editors for headers and env vars"
```

---

### Task 8: Add Paste Config Modal to McpTab

**Files:**
- Modify: `ui/src/components/settings/McpTab.tsx`

**Step 1: Add paste modal state**

In the McpTab component's state declarations, add:

```typescript
const [showPaste, setShowPaste] = useState(false);
const [pasteInput, setPasteInput] = useState('');
const [parseResult, setParseResult] = useState<ParseResult | null>(null);
const [parsedNames, setParsedNames] = useState<Record<string, string>>({});
const [isPasting, setIsPasting] = useState(false);
```

Add the import at the top of the file:

```typescript
import { parseMcpConfig, isValidServerName, type ParseResult, type ParsedServer } from '@/lib/mcp-config-parser';
```

**Step 2: Add parse handler**

```typescript
const handleParse = () => {
  const result = parseMcpConfig(pasteInput);
  setParseResult(result);
  if (result.success) {
    // Initialize editable names
    const names: Record<string, string> = {};
    result.servers.forEach((s, i) => {
      names[i] = s.name || '';
    });
    setParsedNames(names);
  }
};

const handlePasteAdd = async () => {
  if (!parseResult?.success) return;
  setIsPasting(true);

  const serversToAdd = parseResult.servers.map((s, i) => ({
    name: parsedNames[i] || s.name,
    transport: s.transport,
    url: s.url,
    command: s.command,
    args: s.args,
    headers: s.headers,
    env: s.env,
  }));

  // Validate all names
  const invalid = serversToAdd.find((s) => !isValidServerName(s.name));
  if (invalid) {
    setParseResult({
      ...parseResult,
      error: `Invalid name "${invalid.name}" — use letters, numbers, dashes, underscores`,
    });
    setIsPasting(false);
    return;
  }

  const result = await mcpApi.addBatch(serversToAdd as any);
  setIsPasting(false);

  if (result.failed.length === 0) {
    setShowPaste(false);
    setPasteInput('');
    setParseResult(null);
    setParsedNames({});
    await loadServers();
  } else {
    setParseResult({
      ...parseResult,
      error: result.failed.map((f) => `${f.name}: ${f.error}`).join(', '),
    });
    if (result.added.length > 0) await loadServers();
  }
};
```

**Step 3: Add "Paste Config" button to header**

Find the header section (around line 431-448). Add a second button:

```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => { setShowPaste(true); setShowAdd(false); }}
    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold bg-secondary/10 text-secondary-foreground hover:bg-secondary/20 transition-colors border border-border"
  >
    <ClipboardPaste className="h-4 w-4" />
    Paste Config
  </button>
  <button
    onClick={() => { setShowAdd(!showAdd); setShowPaste(false); setError(''); setNameError(''); }}
    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
  >
    {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    {showAdd ? 'Cancel' : 'Add Server'}
  </button>
</div>
```

Add `ClipboardPaste` to the lucide-react imports at the top.

**Step 4: Add paste modal UI**

After the `{showAdd && (...)}` block, add the paste modal:

```tsx
{showPaste && (
  <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <h4 className="text-sm font-semibold">Paste MCP Server Config</h4>
      <button
        onClick={() => { setShowPaste(false); setPasteInput(''); setParseResult(null); }}
        className="rounded p-1 hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>

    <p className="text-xs text-muted-foreground">
      Paste a JSON config from docs or Claude Code. Supports single servers and
      <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">mcpServers</code>
      blocks with multiple servers.
    </p>

    <textarea
      value={pasteInput}
      onChange={(e) => { setPasteInput(e.target.value); setParseResult(null); }}
      placeholder='{"mcpServers": {"my-server": {"type": "http", "url": "https://..."}}}'
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono leading-relaxed h-32 resize-y focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
    />

    {!parseResult && (
      <button
        onClick={handleParse}
        disabled={!pasteInput.trim()}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Parse
      </button>
    )}

    {parseResult && !parseResult.success && (
      <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
        {parseResult.error}
      </p>
    )}

    {parseResult?.success && (
      <div className="space-y-3">
        <p className="text-xs font-medium text-green-400">
          Found {parseResult.servers.length} server{parseResult.servers.length > 1 ? 's' : ''}
        </p>

        {parseResult.error && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
            {parseResult.error}
          </p>
        )}

        <div className="space-y-2">
          {parseResult.servers.map((server, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                TRANSPORT_BADGE[server.transport].bg
              } ${TRANSPORT_BADGE[server.transport].text}`}>
                {server.transport}
              </span>
              <input
                type="text"
                value={parsedNames[i] ?? server.name}
                onChange={(e) => setParsedNames((prev) => ({ ...prev, [i]: e.target.value }))}
                placeholder="server-name"
                className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
              />
              <span className="truncate text-[10px] text-muted-foreground max-w-[200px]">
                {server.url || server.command || ''}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handlePasteAdd}
          disabled={isPasting}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPasting ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            `Add ${parseResult.servers.length} Server${parseResult.servers.length > 1 ? 's' : ''}`
          )}
        </button>
      </div>
    )}
  </div>
)}
```

**Step 5: Verify build**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add ui/src/components/settings/McpTab.tsx
git commit -m "feat(mcp): add paste-to-add modal with multi-format JSON parser"
```

---

### Task 9: Add Tool Pills to Server Card

**Files:**
- Modify: `ui/src/components/settings/McpTab.tsx`

**Step 1: Add tool count to collapsed view**

Find the collapsed server card row (around line 634). After the transport badge, add a tool count:

```tsx
{/* Tool count */}
{(server.toolCount ?? 0) > 0 && (
  <span className="text-[10px] text-muted-foreground">
    {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}
  </span>
)}
```

**Step 2: Add tool pills to expanded view**

Find the expanded details section (around line 698). After the status line, add:

```tsx
{/* Tool list */}
{server.tools && server.tools.length > 0 && (
  <div className="space-y-1.5">
    <button
      onClick={(e) => {
        e.stopPropagation();
        // Toggle tools visibility via a local expanded set
      }}
      className="text-[11px] text-primary hover:underline"
    >
      {server.toolCount} tool{(server.toolCount ?? 0) !== 1 ? 's' : ''} available
    </button>
    <div className="flex flex-wrap gap-1">
      {server.tools.map((tool) => (
        <span
          key={tool}
          className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border"
        >
          {tool}
        </span>
      ))}
    </div>
  </div>
)}

{/* Discover tools prompt (no tools cached yet) */}
{(!server.tools || server.tools.length === 0) && server.transport === 'http' && server.enabled && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handlePingOne(server.name);
    }}
    className="text-[10px] text-primary hover:underline"
  >
    Ping to discover tools
  </button>
)}
```

**Step 3: Update pingOne handler to update cached tools in state**

In `handlePingOne` (line 401), update to also cache tools locally:

```typescript
const handlePingOne = async (serverName: string) => {
  setStatuses((prev) => ({ ...prev, [serverName]: 'checking' }));
  try {
    const result = await mcpApi.pingOne(serverName);
    if (result.success && result.data) {
      setStatuses((prev) => ({
        ...prev,
        [serverName]: result.data!.status as ServerHealth,
      }));
      // Update tools in local state
      if (result.data.tools) {
        setServers((prev) =>
          prev.map((s) =>
            s.name === serverName
              ? { ...s, tools: result.data!.tools, toolCount: result.data!.toolCount }
              : s
          )
        );
      }
    }
  } catch {
    setStatuses((prev) => ({ ...prev, [serverName]: 'offline' }));
  }
};
```

**Step 4: Verify build**

Run: `cd /Users/jb/vaporforge && npm run build:ui 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add ui/src/components/settings/McpTab.tsx
git commit -m "feat(mcp): add tool pills and tool count to server cards"
```

---

### Task 10: Bump Version + Build + Deploy

**Files:**
- Modify: `ui/src/lib/version.ts`
- Modify: `package.json`

**Step 1: Bump version to 0.21.0**

Update `package.json` version to `0.21.0`.

Update `ui/src/lib/version.ts`:
- Change `APP_VERSION` to `'0.21.0'`
- Add changelog entry at the top of the array:

```typescript
{
  version: '0.21.0',
  date: '2026-02-15',
  tag: 'feature' as const,
  title: 'MCP Server Management Upgrade',
  items: [
    'Paste JSON config to add servers (supports Claude Code, Warp, and raw formats)',
    'Custom HTTP headers for server authentication (Bearer tokens, API keys)',
    'Environment variables for stdio/CLI servers',
    'Tool discovery: ping servers to see available tools as pill badges',
    'Multi-server batch add from pasted JSON blocks',
  ],
},
```

**Step 2: Update BACKLOG.md**

Check off the 4 Phase 1 items in `docs/plans/BACKLOG.md`.

**Step 3: Full build**

Run: `cd /Users/jb/vaporforge && npm run build`
Expected: Build succeeds with no errors

**Step 4: Deploy**

Run: `cd /Users/jb/vaporforge && npx wrangler deploy`
Expected: Deployment succeeds

**Step 5: Commit and push**

```bash
git add package.json ui/src/lib/version.ts docs/plans/BACKLOG.md
git commit -m "feat: MCP server management upgrade (v0.21.0)

- Paste JSON config to add servers (multi-format parser)
- Custom HTTP headers for server auth
- Env vars for stdio servers
- Tool discovery via MCP tools/list on ping
- Tool pills displayed in expanded server cards"
git push origin main
```

---

## Verification Checklist

After deployment, verify on vaporforge.jbcloud.app:

1. **Paste config**: Open Settings > MCP > Paste Config. Paste `{"mcpServers": {"context7": {"type": "http", "url": "https://mcp.context7.com/mcp"}}}`. Preview shows 1 server. Click Add. Server appears in list.

2. **Headers**: Add Server > HTTP transport. Enter a URL. Click "Add" under Headers. Enter `Authorization` / `Bearer test`. Add server. Verify it saves (list shows server, expand shows no errors).

3. **Env vars**: Add Server > stdio transport. Enter `node server.js`. Click "Add" under Env Vars. Enter `TOKEN` / `test123`. Add server. Verify it saves.

4. **Tool discovery**: Find an online HTTP server (e.g. context7). Click the refresh/ping icon. Wait for green status. Expand the server card — tool names should appear as pill badges.

5. **Multi-server paste**: Paste a JSON with 2+ servers in `mcpServers` block. Preview shows both. Edit names if needed. Click "Add 2 Servers". Both appear in list.
