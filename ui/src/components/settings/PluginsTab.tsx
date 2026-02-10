import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Puzzle,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Bot,
  Terminal,
  BookOpen,
  Server,
  Github,
  ExternalLink,
  Search,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { pluginsApi } from '@/lib/api';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useSettingsStore } from '@/hooks/useSettings';
import type { Plugin, PluginItem } from '@/lib/types';

/* ─── Sub-item row ─── */

function ItemRow({
  item,
  icon,
  onToggle,
}: {
  item: PluginItem;
  icon: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
      !item.enabled ? 'opacity-50' : ''
    }`}>
      {icon}
      <span className="flex-1 truncate font-mono">{item.filename}</span>
      <button
        onClick={onToggle}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          item.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
          item.enabled ? 'left-[13px]' : 'left-0.5'
        }`} />
      </button>
    </div>
  );
}

/* ─── Section group (Agents / Commands / Rules / MCP) ─── */

function ItemSection({
  label,
  icon,
  items,
  pluginId,
  itemType,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  items: PluginItem[];
  pluginId: string;
  itemType: string;
  onToggle: (pluginId: string, itemType: string, itemName: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-2">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {label} ({items.length})
      </span>
      <div className="space-y-0.5">
        {items.map((item) => (
          <ItemRow
            key={item.filename}
            item={item}
            icon={icon}
            onToggle={() => onToggle(pluginId, itemType, item.name)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Plugin card ─── */

function PluginCard({
  plugin,
  onToggle,
  onToggleItem,
  onDelete,
}: {
  plugin: Plugin;
  onToggle: () => void;
  onToggleItem: (pluginId: string, itemType: string, itemName: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = plugin.agents.length + plugin.commands.length
    + plugin.rules.length + plugin.mcpServers.length;

  return (
    <div className={`rounded-lg border border-border transition-colors ${
      !plugin.enabled ? 'opacity-60' : ''
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 rounded p-0.5 hover:bg-accent transition-colors"
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>

        <Puzzle className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex-1 truncate text-sm font-medium">{plugin.name}</span>

        {plugin.builtIn && (
          <span className="shrink-0 flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Shield className="h-2.5 w-2.5" />
            Built-in
          </span>
        )}

        {plugin.scope === 'git' && (
          <span className="shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
            GIT
          </span>
        )}

        <span className="shrink-0 text-[10px] text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>

        {/* Toggle */}
        <button
          onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            plugin.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            plugin.enabled ? 'left-[18px]' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {plugin.description && (
            <p className="mb-2 text-xs text-muted-foreground">{plugin.description}</p>
          )}

          <ItemSection
            label="Agents"
            icon={<Bot className="h-3 w-3 text-blue-400" />}
            items={plugin.agents}
            pluginId={plugin.id}
            itemType="agent"
            onToggle={onToggleItem}
          />
          <ItemSection
            label="Commands"
            icon={<Terminal className="h-3 w-3 text-green-400" />}
            items={plugin.commands}
            pluginId={plugin.id}
            itemType="command"
            onToggle={onToggleItem}
          />
          <ItemSection
            label="Rules"
            icon={<BookOpen className="h-3 w-3 text-amber-400" />}
            items={plugin.rules}
            pluginId={plugin.id}
            itemType="rule"
            onToggle={onToggleItem}
          />
          {plugin.mcpServers.length > 0 && (
            <div className="mt-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                MCP Servers ({plugin.mcpServers.length})
              </span>
              {plugin.mcpServers.map((mcp) => (
                <div key={mcp.name} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
                  <Server className="h-3 w-3 text-cyan-400" />
                  <span className="flex-1 truncate font-mono">{mcp.name}</span>
                  <span className="text-[10px] text-muted-foreground">{mcp.transport}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-2">
            {plugin.repoUrl && (
              <a
                href={plugin.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Github className="h-3 w-3" />
                View on GitHub
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {!plugin.builtIn && (
              <button
                onClick={onDelete}
                className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── New Plugin form ─── */

function NewPluginForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pluginName, setPluginName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Plugin | null>(null);

  const handleDiscover = async () => {
    if (!repoUrl) return;
    setIsDiscovering(true);
    setError('');
    try {
      const result = await pluginsApi.discover(repoUrl);
      if (result.success && result.data) {
        setPreview(result.data);
        if (result.data.name && !pluginName) {
          setPluginName(result.data.name);
        }
        if (result.data.description && !description) {
          setDescription(result.data.description);
        }
      } else {
        setError(result.error || 'Discovery failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleCreate = async () => {
    if (!pluginName) {
      setError('Plugin name is required');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const plugin = {
        name: pluginName,
        description: description || undefined,
        repoUrl: repoUrl || undefined,
        scope: repoUrl ? 'git' as const : 'local' as const,
        enabled: true,
        builtIn: false,
        agents: preview?.agents || [],
        commands: preview?.commands || [],
        rules: preview?.rules || [],
        mcpServers: preview?.mcpServers || [],
      };

      const result = await pluginsApi.add(plugin);
      if (result.success) {
        onCreated();
        onClose();
      } else {
        setError(result.error || 'Failed to create plugin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plugin');
    } finally {
      setIsCreating(false);
    }
  };

  const discoveredCount = preview
    ? preview.agents.length + preview.commands.length + preview.rules.length
    : 0;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          New Plugin
        </span>
        <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <input
        type="text"
        value={pluginName}
        onChange={(e) => { setPluginName(e.target.value); setError(''); }}
        placeholder="Plugin name"
        className="w-full rounded border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      {/* GitHub discovery */}
      <div className="flex gap-2">
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => { setRepoUrl(e.target.value); setError(''); }}
          placeholder="https://github.com/owner/repo"
          className="flex-1 rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleDiscover}
          disabled={!repoUrl || isDiscovering}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {isDiscovering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Search className="h-3 w-3" />
          )}
          Discover
        </button>
      </div>

      {/* Discovery preview */}
      {preview && discoveredCount > 0 && (
        <div className="rounded border border-border/50 bg-accent/20 p-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Discovered {discoveredCount} items
          </span>
          {preview.agents.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {preview.agents.length} agent{preview.agents.length !== 1 ? 's' : ''}:
              {' '}{preview.agents.map((a) => a.filename).join(', ')}
            </p>
          )}
          {preview.commands.length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {preview.commands.length} command{preview.commands.length !== 1 ? 's' : ''}:
              {' '}{preview.commands.map((c) => c.filename).join(', ')}
            </p>
          )}
          {preview.rules.length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {preview.rules.length} rule{preview.rules.length !== 1 ? 's' : ''}:
              {' '}{preview.rules.map((r) => r.filename).join(', ')}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={!pluginName || isCreating}
        className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {isCreating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        Create Plugin
      </button>
    </div>
  );
}

/* ─── Main PluginsTab ─── */

export function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await pluginsApi.list();
      if (result.success && result.data) {
        setPlugins(result.data);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleTogglePlugin = async (pluginId: string, currentEnabled: boolean) => {
    try {
      await pluginsApi.toggle(pluginId, { enabled: !currentEnabled });
      await loadPlugins();
    } catch {
      // Toggle failed
    }
  };

  const handleToggleItem = async (pluginId: string, itemType: string, itemName: string) => {
    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    // Find current enabled state of the item
    type ItemArray = 'agents' | 'commands' | 'rules';
    const typeMap: Record<string, ItemArray> = {
      agent: 'agents',
      command: 'commands',
      rule: 'rules',
    };
    const arr = typeMap[itemType];
    if (!arr) return;
    const item = plugin[arr].find((i) => i.name === itemName);
    if (!item) return;

    try {
      await pluginsApi.toggle(pluginId, {
        enabled: !item.enabled,
        itemType,
        itemName,
      });
      await loadPlugins();
    } catch {
      // Toggle failed
    }
  };

  const handleDelete = async (pluginId: string) => {
    try {
      await pluginsApi.remove(pluginId);
      await loadPlugins();
    } catch {
      // Delete failed
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshResult(null);
    try {
      const result = await pluginsApi.refresh();
      if (result.success && result.data) {
        setPlugins(result.data.plugins);
        const n = result.data.refreshed;
        setRefreshResult(
          `Refreshed ${n} plugin${n !== 1 ? 's' : ''}`
        );
        setTimeout(() => setRefreshResult(null), 3000);
      }
    } catch {
      setRefreshResult('Refresh failed');
      setTimeout(() => setRefreshResult(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const builtIns = plugins.filter((p) => p.builtIn);
  const custom = plugins.filter((p) => !p.builtIn);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Puzzle className="h-4 w-4 text-primary" />
          Plugins &amp; Agents
          {plugins.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {plugins.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          {showNew ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-primary" />}
          {showNew ? 'Cancel' : 'New Plugin'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Plugins bundle agents, commands, and rules. Built-in plugins are always
        available. Add custom plugins from GitHub repos or create them locally.
      </p>

      <button
        onClick={() => {
          useSettingsStore.getState().closeSettings();
          useMarketplace.getState().openMarketplace();
        }}
        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Puzzle className="h-3.5 w-3.5" />
        Browse Marketplace
        <span className="ml-auto text-[10px] text-muted-foreground">146 plugins</span>
      </button>

      {showNew && (
        <NewPluginForm
          onClose={() => setShowNew(false)}
          onCreated={loadPlugins}
        />
      )}

      {/* Built-in plugins */}
      {builtIns.length > 0 && (
        <div>
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Built-in
          </span>
          <div className="space-y-2">
            {builtIns.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                onToggleItem={handleToggleItem}
                onDelete={() => handleDelete(plugin.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom plugins */}
      {custom.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Custom
            </span>
            <div className="flex items-center gap-2">
              {refreshResult && (
                <span className="text-[10px] text-primary animate-fade-up">
                  {refreshResult}
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {custom.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                onToggleItem={handleToggleItem}
                onDelete={() => handleDelete(plugin.id)}
              />
            ))}
          </div>
        </div>
      )}

      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No plugins configured
        </p>
      )}
    </div>
  );
}
