import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Server,
  Loader2,
  X,
  Globe,
  Terminal,
  Radio,
  Check,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  ExternalLink,
  Circle,
  Search,
  ClipboardPaste,
  Upload,
  Pencil,
  Save,
  Code,
} from 'lucide-react';
import { mcpApi } from '@/lib/api';
import type { McpServerConfig } from '@/lib/types';
import {
  parseMcpConfig,
  isValidServerName,
  type ParseResult,
} from '@/lib/mcp-config-parser';
import {
  MCP_CATALOG,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type CatalogServer,
} from '@/lib/mcp-catalog';

type Transport = 'http' | 'stdio' | 'relay';
type ServerHealth = 'online' | 'offline' | 'auth-required' | 'checking' | 'unknown' | 'relay' | 'disabled';

const STATUS_CONFIG: Record<ServerHealth, { dot: string; label: string }> = {
  online: { dot: 'bg-green-500', label: 'Connected' },
  offline: { dot: 'bg-red-500', label: 'Disconnected' },
  'auth-required': { dot: 'bg-yellow-500', label: 'Auth Required' },
  checking: { dot: 'bg-yellow-500 animate-pulse', label: 'Checking...' },
  unknown: { dot: 'bg-gray-500', label: 'Unknown' },
  relay: { dot: 'bg-purple-500', label: 'Relay' },
  disabled: { dot: 'bg-gray-500', label: 'Disabled' },
};

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateName(name: string): string | null {
  if (!name) return 'Name is required';
  if (name.length > 100) return 'Name must be 100 characters or fewer';
  if (!NAME_REGEX.test(name)) return 'Only letters, numbers, dashes, underscores';
  return null;
}

function validateUrl(url: string): string | null {
  if (!url) return 'URL is required';
  try {
    new URL(url);
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

function validateLocalUrl(url: string): string | null {
  if (!url) return 'Local URL is required for relay transport';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'Relay URL must point to localhost or 127.0.0.1';
    }
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

const TRANSPORT_BADGE: Record<Transport, { bg: string; text: string }> = {
  http: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  stdio: { bg: 'bg-green-500/10', text: 'text-green-400' },
  relay: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
};

const AUTH_BADGE: Record<CatalogServer['auth'], { label: string; className: string }> = {
  none: { label: 'No auth', className: 'text-green-400' },
  oauth: { label: 'OAuth', className: 'text-yellow-400' },
  'api-key': { label: 'API Key', className: 'text-yellow-400' },
};

/** Convert key-value entries to a Record, filtering empty pairs */
function entriesToRecord(
  entries: Array<{ key: string; value: string }>
): Record<string, string> | undefined {
  const filtered = entries.filter((e) => e.key.trim() && e.value.trim());
  if (filtered.length === 0) return undefined;
  return Object.fromEntries(filtered.map((e) => [e.key.trim(), e.value]));
}

/* ─── Key-Value Editor (headers / env vars) ──────────── */

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

/* ─── Catalog browse section ──────────────────────────── */

function CatalogSection({
  servers,
  onAdd,
}: {
  servers: McpServerConfig[];
  onAdd: (entry: CatalogServer) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [addingName, setAddingName] = useState<string | null>(null);
  const [filter, setFilter] = useState<CatalogServer['category'] | 'all'>('all');

  const installedNames = useMemo(
    () => new Set(servers.map((s) => s.name)),
    [servers],
  );

  const filtered = filter === 'all'
    ? MCP_CATALOG
    : MCP_CATALOG.filter((s) => s.category === filter);

  const categories = useMemo(() => {
    const cats = new Set(MCP_CATALOG.map((s) => s.category));
    return ['all' as const, ...Array.from(cats)] as const;
  }, []);

  const handleAdd = async (entry: CatalogServer) => {
    setAddingName(entry.name);
    try {
      await onAdd(entry);
    } finally {
      setAddingName(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex w-full items-center gap-2.5 rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 px-4 py-3 text-sm font-semibold transition-all hover:from-primary/10 hover:to-secondary/10 border border-primary/10"
      >
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="uppercase tracking-wide text-foreground">Browse Recommended</span>
        <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/30">
          {MCP_CATALOG.length}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-primary transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="space-y-3 animate-fade-up">
          {/* Category filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  filter === cat
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
                }`}
              >
                {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Server cards */}
          <div className="space-y-2">
            {filtered.map((entry) => {
              const installed = installedNames.has(entry.name);
              const isAdding = addingName === entry.name;
              const catColor = CATEGORY_COLORS[entry.category];
              const authInfo = AUTH_BADGE[entry.auth];

              return (
                <div
                  key={entry.name}
                  className={`group flex items-start gap-3 rounded-lg border bg-card px-4 py-3 transition-all ${
                    installed
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-border hover:border-primary/30 hover:shadow-sm'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {entry.name}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${catColor}`}
                      >
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                      {entry.auth !== 'none' && (
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${authInfo.className}`}>
                          <Lock className="h-3 w-3" />
                          {authInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      {entry.description}
                    </p>
                    {entry.authNote && entry.auth !== 'none' && (
                      <p className="mt-1 text-[10px] text-muted-foreground/70 italic">
                        {entry.authNote}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleAdd(entry)}
                    disabled={installed || isAdding}
                    className={`mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                      installed
                        ? 'bg-green-500/10 text-green-500 cursor-default border border-green-500/20'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                    } disabled:opacity-70`}
                  >
                    {isAdding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : installed ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {installed ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main McpTab ─────────────────────────────────────── */

export function McpTab() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [transport, setTransport] = useState<Transport>('http');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [command, setCommand] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [statuses, setStatuses] = useState<Record<string, ServerHealth>>({});
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [headerEntries, setHeaderEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [envEntries, setEnvEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [credentialFiles, setCredentialFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsedNames, setParsedNames] = useState<Record<number, string>>({});
  const [isPasting, setIsPasting] = useState(false);

  // Edit mode state
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [editTransport, setEditTransport] = useState<Transport>('http');
  const [editUrl, setEditUrl] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editLocalUrl, setEditLocalUrl] = useState('');
  const [editHeaders, setEditHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [editEnv, setEditEnv] = useState<Array<{ key: string; value: string }>>([]);
  const [editCredFiles, setEditCredFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showJson, setShowJson] = useState<string | null>(null);

  const toggleExpanded = (name: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await mcpApi.list();
      if (result.success && result.data) {
        setServers(result.data);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Auto-ping servers after loading
  useEffect(() => {
    if (!isLoading && servers.length > 0) {
      pingAll(servers);
    }
  }, [isLoading, servers.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setCredentialFiles([]);
    setShowAdd(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError('');
    setError('');
  };

  const handleAdd = async () => {
    const nameErr = validateName(name);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }

    if (transport === 'http') {
      const urlErr = validateUrl(url);
      if (urlErr) { setError(urlErr); return; }
    } else if (transport === 'stdio') {
      if (!command.trim()) { setError('Command is required for stdio transport'); return; }
    } else if (transport === 'relay') {
      const localErr = validateLocalUrl(localUrl);
      if (localErr) { setError(localErr); return; }
    }

    setIsAdding(true);
    setError('');
    try {
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
        const validCreds = credentialFiles.filter((c) => c.path.trim() && c.content.trim());
        if (validCreds.length > 0) {
          server.credentialFiles = validCreds.map((c) => ({
            path: c.path.trim(),
            content: c.content.trim(),
          }));
        }
      } else if (transport === 'relay') {
        server.localUrl = localUrl;
      }

      const result = await mcpApi.add(server as Omit<McpServerConfig, 'addedAt' | 'enabled'>);
      if (result.success) {
        resetForm();
        await loadServers();
      } else {
        setError(result.error || 'Failed to add server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    } finally {
      setIsAdding(false);
    }
  };

  const handleCatalogAdd = async (entry: CatalogServer) => {
    const server = {
      name: entry.name,
      transport: 'http' as const,
      url: entry.url,
    };
    const result = await mcpApi.add(server);
    if (result.success) {
      await loadServers();
    }
  };

  /** Parse pasted JSON config */
  const handleParse = () => {
    const result = parseMcpConfig(pasteInput);
    setParseResult(result);
    if (result.success) {
      const names: Record<number, string> = {};
      result.servers.forEach((s, i) => {
        names[i] = s.name || '';
      });
      setParsedNames(names);
    }
  };

  /** Add all parsed servers from paste modal */
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

    const result = await mcpApi.addBatch(
      serversToAdd as Array<Omit<McpServerConfig, 'addedAt' | 'enabled'>>
    );
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

  /** Open edit mode for a server */
  const startEdit = (server: McpServerConfig) => {
    setEditingServer(server.name);
    setEditTransport(server.transport);
    setEditUrl(server.url || '');
    setEditLocalUrl(server.localUrl || '');
    // Reconstruct full command string from command + args
    const cmdParts = [server.command || '', ...(server.args || [])].filter(Boolean);
    setEditCommand(cmdParts.join(' '));
    setEditHeaders(
      server.headers
        ? Object.entries(server.headers).map(([key, value]) => ({ key, value }))
        : []
    );
    setEditEnv(
      server.env
        ? Object.entries(server.env).map(([key, value]) => ({ key, value }))
        : []
    );
    setEditCredFiles(server.credentialFiles || []);
    setEditError('');
    setShowJson(null);
    // Auto-expand the server
    setExpandedServers((prev) => new Set([...prev, server.name]));
  };

  /** Cancel edit mode */
  const cancelEdit = () => {
    setEditingServer(null);
    setEditError('');
  };

  /** Save edits */
  const handleSaveEdit = async () => {
    if (!editingServer) return;

    if (editTransport === 'http') {
      const urlErr = validateUrl(editUrl);
      if (urlErr) { setEditError(urlErr); return; }
    } else if (editTransport === 'stdio') {
      if (!editCommand.trim()) { setEditError('Command is required'); return; }
    } else if (editTransport === 'relay') {
      const localErr = validateLocalUrl(editLocalUrl);
      if (localErr) { setEditError(localErr); return; }
    }

    setIsSaving(true);
    setEditError('');
    try {
      const payload: Record<string, unknown> = { transport: editTransport };

      if (editTransport === 'http') {
        payload.url = editUrl;
        const headers = entriesToRecord(editHeaders);
        if (headers) payload.headers = headers;
      } else if (editTransport === 'stdio') {
        const parts = editCommand.trim().split(/\s+/);
        payload.command = parts[0];
        if (parts.length > 1) payload.args = parts.slice(1);
        const env = entriesToRecord(editEnv);
        if (env) payload.env = env;
        const validCreds = editCredFiles.filter((c) => c.path.trim() && c.content.trim());
        if (validCreds.length > 0) {
          payload.credentialFiles = validCreds.map((c) => ({
            path: c.path.trim(),
            content: c.content.trim(),
          }));
        }
      } else if (editTransport === 'relay') {
        payload.localUrl = editLocalUrl;
      }

      const result = await mcpApi.update(editingServer, payload as Partial<McpServerConfig>);
      if (result.success) {
        setEditingServer(null);
        await loadServers();
      } else {
        setEditError(result.error || 'Failed to save');
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  /** Get JSON representation for a server */
  const getServerJson = (server: McpServerConfig): string => {
    const config: Record<string, unknown> = {};
    if (server.transport === 'http') {
      config.url = server.url;
      if (server.headers && Object.keys(server.headers).length > 0) config.headers = server.headers;
    } else if (server.transport === 'stdio') {
      config.command = server.command;
      if (server.args && server.args.length > 0) config.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) config.env = server.env;
    } else if (server.transport === 'relay') {
      config.localUrl = server.localUrl;
    }
    return JSON.stringify({ [server.name]: config }, null, 2);
  };

  const handleRemove = async (serverName: string) => {
    try {
      await mcpApi.remove(serverName);
      await loadServers();
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async (serverName: string) => {
    try {
      await mcpApi.toggle(serverName);
      await loadServers();
    } catch {
      // Toggle failed
    }
  };

  /** Batch ping all servers */
  const pingAll = useCallback(async (serverList: McpServerConfig[]) => {
    if (serverList.length === 0) return;

    const checking: Record<string, ServerHealth> = {};
    for (const s of serverList) checking[s.name] = 'checking';
    setStatuses(checking);

    try {
      const result = await mcpApi.ping();
      if (result.success && result.data) {
        const next: Record<string, ServerHealth> = {};
        for (const [name, info] of Object.entries(result.data)) {
          next[name] = info.status as ServerHealth;
        }
        setStatuses(next);
      }
    } catch {
      // Keep checking states — don't overwrite
    }
  }, []);

  /** Single server reconnect / ping */
  const handlePingOne = async (serverName: string) => {
    setStatuses((prev) => ({ ...prev, [serverName]: 'checking' }));
    try {
      const result = await mcpApi.pingOne(serverName);
      if (result.success && result.data) {
        setStatuses((prev) => ({
          ...prev,
          [serverName]: result.data!.status as ServerHealth,
        }));
        // Update tools in local state if discovered
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

  /** Whether the add button should be disabled */
  const addDisabled = !name
    || (transport === 'http' ? !url : transport === 'stdio' ? !command : !localUrl)
    || isAdding;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex min-h-[44px] items-center justify-between">
        <h3 className="flex min-w-0 items-center gap-2.5 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Server className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate">MCP Servers</span>
          {servers.length > 0 && (
            <span className="ml-1 shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
              {servers.length}
            </span>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => { setShowPaste(true); setShowAdd(false); }}
            className="flex items-center gap-1.5 rounded-lg px-2 sm:px-3 text-xs font-semibold bg-secondary/10 text-secondary-foreground hover:bg-secondary/20 transition-colors border border-border"
            style={{ height: '36px' }}
            title="Paste config JSON"
          >
            <ClipboardPaste className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Paste Config</span>
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowPaste(false); setError(''); setNameError(''); }}
            className="flex items-center gap-1.5 rounded-lg px-2 sm:px-3 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
            style={{ height: '36px' }}
            title={showAdd ? 'Cancel' : 'Add MCP server'}
          >
            {showAdd ? <X className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
            <span className="hidden sm:inline">{showAdd ? 'Cancel' : 'Add Server'}</span>
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
        MCP servers are persisted and injected into every new session.
        No active session required.
      </p>

      {/* Search */}
      {servers.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search servers..."
            className="w-full rounded-lg border border-border bg-muted pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {showAdd && (
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          {/* Transport toggle — 3 options */}
          <div className="flex gap-1.5 rounded-lg bg-muted p-1">
            <button
              onClick={() => { setTransport('http'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                transport === 'http'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              HTTP
            </button>
            <button
              onClick={() => { setTransport('stdio'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                transport === 'stdio'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              stdio
            </button>
            <button
              onClick={() => { setTransport('relay'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                transport === 'relay'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              Relay
            </button>
          </div>

          {/* Name input */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Server name (e.g. my-server)"
              className={`w-full rounded-lg border bg-background px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                nameError
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                  : 'border-border focus:border-primary focus:ring-primary/20'
              }`}
            />
            {nameError && (
              <p className="mt-1.5 text-xs text-red-400 font-medium">{nameError}</p>
            )}
          </div>

          {/* Transport-specific input */}
          {transport === 'http' && (
            <div>
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="https://mcp.example.com/sse"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Full URL of the HTTP MCP server endpoint
              </p>
            </div>
          )}

          {transport === 'stdio' && (
            <div>
              <input
                type="text"
                value={command}
                onChange={(e) => { setCommand(e.target.value); setError(''); }}
                placeholder="npx @gongrzhe/server-gmail-autoauth-mcp"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                The full command to start the server. Find this in the server's README — usually{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npx @scope/package-name</code> or{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">node /path/to/server.js</code>
              </p>
            </div>
          )}

          {transport === 'relay' && (
            <div>
              <input
                type="text"
                value={localUrl}
                onChange={(e) => { setLocalUrl(e.target.value); setError(''); }}
                placeholder="http://localhost:9222"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                URL of the MCP server running on your machine (must be localhost)
              </p>
            </div>
          )}

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

          {/* Credential Files (stdio only) */}
          {transport === 'stdio' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Credential Files <span className="text-muted-foreground/50">(optional, max 5)</span>
                </label>
                {credentialFiles.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setCredentialFiles([...credentialFiles, { path: '', content: '' }])}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Plus className="h-3 w-3" /> Add File
                  </button>
                )}
              </div>
              {credentialFiles.map((cred, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cred.path}
                      onChange={(e) => setCredentialFiles(credentialFiles.map((c, j) =>
                        j === i ? { ...c, path: e.target.value } : c
                      ))}
                      placeholder="/root/.config/credentials.json"
                      className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCredentialFiles(credentialFiles.filter((_, j) => j !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="relative">
                    <textarea
                      value={cred.content}
                      onChange={(e) => setCredentialFiles(credentialFiles.map((c, j) =>
                        j === i ? { ...c, content: e.target.value } : c
                      ))}
                      placeholder="Paste file content or use Upload button"
                      rows={3}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none resize-y"
                    />
                    <label className="absolute right-2 top-2 flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors border border-primary/20">
                      <Upload className="h-3 w-3" />
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        accept=".json,.yaml,.yml,.toml,.txt,.pem,.key,.crt,.cfg,.conf,*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const text = reader.result as string;
                            setCredentialFiles(credentialFiles.map((c, j) => {
                              if (j !== i) return c;
                              const pathVal = c.path || `/root/.config/${file.name}`;
                              return { ...c, content: text, path: pathVal };
                            }));
                          };
                          reader.readAsText(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {cred.content && (
                    <p className="text-[10px] text-muted-foreground/60">
                      {cred.content.length.toLocaleString()} chars loaded
                    </p>
                  )}
                </div>
              ))}
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 border border-border/40 space-y-1.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Some MCP servers need credential files on disk (e.g. OAuth tokens).
                  Add each file the server expects — enter the <strong className="text-foreground/80">container path</strong> where
                  it should be written, then paste the file content below.
                </p>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Example: Gmail MCP needs <code className="rounded bg-muted px-1 py-0.5">credentials.json</code> and <code className="rounded bg-muted px-1 py-0.5">gcp-oauth.keys.json</code> in <code className="rounded bg-muted px-1 py-0.5">/root/.gmail-mcp/</code>.
                  Files are injected at session start and persist until the container recycles.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 font-medium bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>
          )}

          <button
            onClick={handleAdd}
            disabled={addDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Server
          </button>
        </div>
      )}

      {/* Paste Config Modal */}
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
            placeholder='{"mcpServers": {"my-server": {"url": "https://..."}}}'
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

      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-lg border border-dashed border-border">
          No MCP servers configured yet
        </p>
      ) : (
        <div className="space-y-2">
          {servers.filter((s) => {
            const sq = searchQuery.toLowerCase().trim();
            if (!sq) return true;
            const catalogEntry = MCP_CATALOG.find((c) => c.name === s.name);
            return s.name.toLowerCase().includes(sq)
              || (catalogEntry?.description || '').toLowerCase().includes(sq);
          }).map((server) => {
            const badge = TRANSPORT_BADGE[server.transport] || TRANSPORT_BADGE.http;
            const subtitle = server.transport === 'relay'
              ? server.localUrl
              : server.url || server.command || 'stdio';
            const catalogEntry = MCP_CATALOG.find((c) => c.name === server.name);
            const health = statuses[server.name] || 'unknown';
            const { dot, label } = STATUS_CONFIG[health];
            const isExpanded = expandedServers.has(server.name);
            const isPinging = health === 'checking';
            const isEditing = editingServer === server.name;
            const isShowingJson = showJson === server.name;

            return (
              <div
                key={server.name}
                className={`rounded-lg border bg-card transition-all ${
                  !server.enabled
                    ? 'opacity-50 bg-muted/30 border-border'
                    : health === 'online'
                      ? 'border-green-500/20'
                      : health === 'offline'
                        ? 'border-red-500/20'
                        : health === 'auth-required'
                          ? 'border-yellow-500/20'
                          : 'border-border'
                }`}
              >
                {/* Main row — clickable to expand */}
                <div
                  onClick={() => toggleExpanded(server.name)}
                  className="group flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
                        title={label}
                      />
                      <span className="text-sm font-medium truncate">{server.name}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                        {server.transport}
                      </span>
                      {(server.toolCount ?? 0) > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''} available
                        </span>
                      )}
                      {catalogEntry?.auth && catalogEntry.auth !== 'none' && (
                        <Lock className="h-3 w-3 shrink-0 text-yellow-400" />
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    {/* Tool pills in main row */}
                    {server.tools && server.tools.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1 pl-4">
                        {server.tools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-0.5 truncate pl-4 text-[10px] text-muted-foreground font-mono">
                        {subtitle}
                      </p>
                    )}
                  </div>

                  <div className="ml-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {/* Reconnect / ping button */}
                    {server.enabled && server.transport === 'http' && (
                      <button
                        onClick={() => handlePingOne(server.name)}
                        disabled={isPinging}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-all disabled:opacity-50"
                        title="Check connection"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                      </button>
                    )}

                    {/* JSON view button */}
                    <button
                      onClick={() => setShowJson(isShowingJson ? null : server.name)}
                      className={`rounded p-1 transition-all ${
                        isShowingJson
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                      title="View JSON"
                    >
                      <Code className="h-3.5 w-3.5" />
                    </button>

                    {/* Edit button */}
                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(server)}
                      className={`rounded p-1 transition-all ${
                        isEditing
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                      title="Edit server"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(server.name)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        server.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                      title={server.enabled ? 'Disable' : 'Enable'}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          server.enabled ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleRemove(server.name)}
                      className="flex-shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* JSON view */}
                {isShowingJson && (
                  <div className="border-t border-border/50 px-4 py-3 animate-fade-up">
                    <pre className="rounded-lg bg-muted/50 border border-border/50 p-3 text-xs font-mono text-foreground/80 overflow-x-auto leading-relaxed">
                      {getServerJson(server)}
                    </pre>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <div className="border-t border-border/50 px-4 py-3 space-y-3 animate-fade-up">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-foreground">Edit {server.name}</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={cancelEdit}
                          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save
                        </button>
                      </div>
                    </div>

                    {/* Transport toggle */}
                    <div className="flex gap-1 rounded-lg bg-muted p-1">
                      {(['http', 'stdio', 'relay'] as Transport[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => { setEditTransport(t); setEditError(''); }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                            editTransport === t
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                          }`}
                        >
                          {t === 'http' ? <Globe className="h-3 w-3" /> : t === 'stdio' ? <Terminal className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                          {t}
                        </button>
                      ))}
                    </div>

                    {/* Transport-specific fields */}
                    {editTransport === 'http' && (
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => { setEditUrl(e.target.value); setEditError(''); }}
                        placeholder="https://mcp.example.com/sse"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                      />
                    )}
                    {editTransport === 'stdio' && (
                      <div>
                        <input
                          type="text"
                          value={editCommand}
                          onChange={(e) => { setEditCommand(e.target.value); setEditError(''); }}
                          placeholder="npx @scope/mcp-server-name"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Full command to start the server
                        </p>
                      </div>
                    )}
                    {editTransport === 'relay' && (
                      <input
                        type="text"
                        value={editLocalUrl}
                        onChange={(e) => { setEditLocalUrl(e.target.value); setEditError(''); }}
                        placeholder="http://localhost:9222"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                      />
                    )}

                    {/* Headers (HTTP) */}
                    {editTransport === 'http' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Headers</label>
                        <KeyValueEditor entries={editHeaders} onChange={setEditHeaders} keyPlaceholder="Authorization" valuePlaceholder="Bearer sk-..." />
                      </div>
                    )}

                    {/* Env vars (stdio) */}
                    {editTransport === 'stdio' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Environment Variables</label>
                        <KeyValueEditor entries={editEnv} onChange={setEditEnv} keyPlaceholder="GITHUB_TOKEN" valuePlaceholder="ghp_..." />
                      </div>
                    )}

                    {/* Credential files (stdio) */}
                    {editTransport === 'stdio' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Credential Files</label>
                          {editCredFiles.length < 5 && (
                            <button
                              type="button"
                              onClick={() => setEditCredFiles([...editCredFiles, { path: '', content: '' }])}
                              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                            >
                              <Plus className="h-3 w-3" /> Add File
                            </button>
                          )}
                        </div>
                        {editCredFiles.map((cred, i) => (
                          <div key={i} className="space-y-1.5 rounded-lg border border-border/60 bg-background/50 p-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={cred.path}
                                onChange={(e) => setEditCredFiles(editCredFiles.map((c, j) =>
                                  j === i ? { ...c, path: e.target.value } : c
                                ))}
                                placeholder="/root/.config/credentials.json"
                                className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setEditCredFiles(editCredFiles.filter((_, j) => j !== i))}
                                className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="relative">
                              <textarea
                                value={cred.content}
                                onChange={(e) => setEditCredFiles(editCredFiles.map((c, j) =>
                                  j === i ? { ...c, content: e.target.value } : c
                                ))}
                                placeholder="Paste file content or use Upload button"
                                rows={2}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none resize-y"
                              />
                              <label className="absolute right-2 top-1.5 flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors border border-primary/20">
                                <Upload className="h-3 w-3" />
                                Upload
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".json,.yaml,.yml,.toml,.txt,.pem,.key,.crt,.cfg,.conf,*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const text = reader.result as string;
                                      setEditCredFiles(editCredFiles.map((c, j) => {
                                        if (j !== i) return c;
                                        const pathVal = c.path || `/root/.config/${file.name}`;
                                        return { ...c, content: text, path: pathVal };
                                      }));
                                    };
                                    reader.readAsText(file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {editError && (
                      <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{editError}</p>
                    )}
                  </div>
                )}

                {/* Expanded details (read-only, when NOT editing) */}
                {isExpanded && !isEditing && !isShowingJson && (
                  <div className="border-t border-border/50 px-4 py-3 space-y-2 animate-fade-up">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {catalogEntry?.description || 'Custom MCP server'}
                    </p>

                    <div className="flex items-center gap-2 text-[11px]">
                      <Circle className={`h-2.5 w-2.5 fill-current ${
                        health === 'online' ? 'text-green-500'
                          : health === 'offline' ? 'text-red-500'
                          : health === 'auth-required' ? 'text-yellow-500'
                          : 'text-gray-500'
                      }`} />
                      <span className={
                        health === 'online' ? 'text-green-400'
                          : health === 'offline' ? 'text-red-400'
                          : health === 'auth-required' ? 'text-yellow-400'
                          : 'text-muted-foreground'
                      }>
                        {label}
                      </span>
                      <span className="text-muted-foreground/50">
                        Added {new Date(server.addedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Discover tools prompt */}
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

                    {/* Credential files */}
                    {server.credentialFiles && server.credentialFiles.length > 0 && (
                      <div className="space-y-1">
                        {server.credentialFiles.map((cred, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 border border-border/40 font-mono">
                            Credential: {cred.path}
                          </p>
                        ))}
                      </div>
                    )}

                    {catalogEntry?.auth && catalogEntry.auth !== 'none' && (
                      <p className="text-[11px] text-yellow-400/80 bg-yellow-500/5 rounded px-2.5 py-1.5 border border-yellow-500/10">
                        {catalogEntry.authNote || `${catalogEntry.auth} authentication required`}
                      </p>
                    )}

                    {catalogEntry?.repoUrl && (
                      <a
                        href={catalogEntry.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View on GitHub
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border/50" />

      {/* Recommended catalog */}
      <CatalogSection servers={servers} onAdd={handleCatalogAdd} />
    </div>
  );
}
