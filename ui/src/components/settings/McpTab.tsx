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
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Server className="h-5 w-5 text-primary" />
          MCP Servers
          {servers.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
              {servers.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(''); setNameError(''); }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Cancel' : 'Add Server'}
        </button>
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
                placeholder="node /path/to/server.js --flag"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
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
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                URL of the MCP server running on your machine (must be localhost)
              </p>
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
                      {/* Status dot */}
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
                        title={label}
                      />
                      <span className="text-sm font-medium truncate">{server.name}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                        {server.transport}
                      </span>
                      {catalogEntry?.auth && catalogEntry.auth !== 'none' && (
                        <Lock className="h-3 w-3 shrink-0 text-yellow-400" />
                      )}
                      {/* Expand chevron */}
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-0.5 truncate pl-4 text-[10px] text-muted-foreground font-mono">
                      {subtitle}
                    </p>
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

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 py-3 space-y-2 animate-fade-up">
                    {/* Description */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {catalogEntry?.description || 'Custom MCP server'}
                    </p>

                    {/* Status line */}
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

                    {/* Auth note */}
                    {catalogEntry?.auth && catalogEntry.auth !== 'none' && (
                      <p className="text-[11px] text-yellow-400/80 bg-yellow-500/5 rounded px-2.5 py-1.5 border border-yellow-500/10">
                        {catalogEntry.authNote || `${catalogEntry.auth} authentication required`}
                      </p>
                    )}

                    {/* Repo link */}
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
