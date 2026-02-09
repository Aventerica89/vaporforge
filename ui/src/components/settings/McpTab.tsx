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
  Lock,
} from 'lucide-react';
import { mcpApi } from '@/lib/api';
import type { McpServerConfig } from '@/lib/types';
import {
  MCP_CATALOG,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type CatalogServer,
} from '@/lib/mcp-catalog';

type Transport = 'http' | 'stdio' | 'relay';

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
        className="group flex w-full items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <BookOpen className="h-3.5 w-3.5 text-primary" />
        <span className="uppercase tracking-wider">Browse Recommended</span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
          {MCP_CATALOG.length}
        </span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="space-y-3 animate-fade-up">
          {/* Category filter pills */}
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  filter === cat
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Server cards */}
          <div className="space-y-1.5">
            {filtered.map((entry) => {
              const installed = installedNames.has(entry.name);
              const isAdding = addingName === entry.name;
              const catColor = CATEGORY_COLORS[entry.category];
              const authInfo = AUTH_BADGE[entry.auth];

              return (
                <div
                  key={entry.name}
                  className={`group flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2.5 transition-colors hover:border-border ${
                    installed ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {entry.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${catColor}`}
                      >
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                      {entry.auth !== 'none' && (
                        <span className={`flex items-center gap-0.5 text-[10px] ${authInfo.className}`}>
                          <Lock className="h-2.5 w-2.5" />
                          {authInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {entry.description}
                    </p>
                    {entry.authNote && entry.auth !== 'none' && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70 italic">
                        {entry.authNote}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleAdd(entry)}
                    disabled={installed || isAdding}
                    className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      installed
                        ? 'bg-green-500/10 text-green-400 cursor-default'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    } disabled:opacity-70`}
                  >
                    {isAdding ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : installed ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Plus className="h-3 w-3" />
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

  const resetForm = () => {
    setName('');
    setUrl('');
    setLocalUrl('');
    setCommand('');
    setError('');
    setNameError('');
    setTransport('http');
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
      } else if (transport === 'stdio') {
        const parts = command.trim().split(/\s+/);
        server.command = parts[0];
        if (parts.length > 1) server.args = parts.slice(1);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Server className="h-4 w-4 text-primary" />
          MCP Servers
          {servers.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {servers.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(''); setNameError(''); }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-primary" />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        MCP servers are persisted and injected into every new session.
        No active session required.
      </p>

      {showAdd && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          {/* Transport toggle — 3 options */}
          <div className="flex gap-1 rounded-md bg-muted p-0.5">
            <button
              onClick={() => { setTransport('http'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                transport === 'http'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe className="h-3 w-3" />
              HTTP
            </button>
            <button
              onClick={() => { setTransport('stdio'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                transport === 'stdio'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-3 w-3" />
              stdio
            </button>
            <button
              onClick={() => { setTransport('relay'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                transport === 'relay'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Radio className="h-3 w-3" />
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
              className={`w-full rounded border bg-muted px-3 py-2 text-sm focus:outline-none ${
                nameError
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-border focus:border-primary'
              }`}
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-400">{nameError}</p>
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
                className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
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
                placeholder="node /path/to/server.js --flag"
                className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Command and arguments to start the stdio MCP server
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
                className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                URL of the MCP server running on your machine (must be localhost)
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={handleAdd}
            disabled={addDisabled}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add Server
          </button>
        </div>
      )}

      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No MCP servers configured
        </p>
      ) : (
        <div className="space-y-1">
          {servers.map((server) => {
            const badge = TRANSPORT_BADGE[server.transport] || TRANSPORT_BADGE.http;
            const subtitle = server.transport === 'relay'
              ? server.localUrl
              : server.url || server.command || 'stdio';

            return (
              <div
                key={server.name}
                className={`group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors ${
                  !server.enabled ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="text-sm font-medium truncate">{server.name}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                      {server.transport}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate pl-[22px] text-[10px] text-muted-foreground font-mono">
                    {subtitle}
                  </p>
                </div>

                <div className="ml-2 flex items-center gap-1.5">
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
