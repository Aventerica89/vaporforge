import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Save, X, ToggleLeft, ToggleRight, Puzzle, Search } from 'lucide-react';
import { configApi, pluginsApi } from '@/lib/api';
import type { ConfigFile, ConfigCategory, PluginItem } from '@/lib/types';

interface EditState {
  filename: string;
  content: string;
}

/** Plugin item with its source plugin name */
interface PluginSourceItem extends PluginItem {
  pluginName: string;
}

interface ConfigFileTabProps {
  category: ConfigCategory;
  title: string;
  description: string;
  icon: React.ReactNode;
  addLabel: string;
  emptyLabel: string;
  defaultContent: string;
  /** Prefix for display names (e.g. "/" for commands) */
  displayPrefix?: string;
}

/** Map ConfigCategory to Plugin array key */
const CATEGORY_TO_PLUGIN_KEY: Record<ConfigCategory, 'agents' | 'commands' | 'rules'> = {
  agents: 'agents',
  commands: 'commands',
  rules: 'rules',
};

export function ConfigFileTab({
  category,
  title,
  description,
  icon,
  addLabel,
  emptyLabel,
  defaultContent,
  displayPrefix = '',
}: ConfigFileTabProps) {
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [pluginItems, setPluginItems] = useState<PluginSourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configResult, pluginsResult] = await Promise.all([
        configApi.list(category),
        pluginsApi.list(),
      ]);

      if (configResult.success && configResult.data) {
        setFiles(configResult.data);
      }

      if (pluginsResult.success && pluginsResult.data) {
        const key = CATEGORY_TO_PLUGIN_KEY[category];
        const items: PluginSourceItem[] = [];
        for (const plugin of pluginsResult.data) {
          if (!plugin.enabled) continue;
          for (const item of plugin[key]) {
            items.push({ ...item, pluginName: plugin.name });
          }
        }
        setPluginItems(items);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleSave = async () => {
    if (!editing) return;
    const filename = editing.filename.endsWith('.md')
      ? editing.filename
      : `${editing.filename.replace(/[^a-zA-Z0-9._-]/g, '-')}.md`;

    setIsSaving(true);
    try {
      if (isNew) {
        await configApi.add(category, { filename, content: editing.content });
      } else {
        await configApi.update(category, filename, { content: editing.content });
      }
      setEditing(null);
      setIsNew(false);
      await loadFiles();
    } catch {
      // Save failed
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await configApi.remove(category, filename);
      await loadFiles();
    } catch {
      // Delete failed
    }
  };

  const handleToggle = async (file: ConfigFile) => {
    try {
      await configApi.update(category, file.filename, { enabled: !file.enabled });
      await loadFiles();
    } catch {
      // Toggle failed
    }
  };

  const handleNew = () => {
    setEditing({ filename: '', content: defaultContent });
    setIsNew(true);
  };

  const handleEdit = (file: ConfigFile) => {
    setEditing({ filename: file.filename, content: file.content });
    setIsNew(false);
  };

  // Editor view
  if (editing) {
    const displayName = isNew
      ? ''
      : editing.filename.replace(/\.md$/, '');

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditing(null); setIsNew(false); }}
            className="rounded p-1 hover:bg-accent"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
            {isNew ? `New ${title.replace(/s$/, '')}` : `Edit: ${displayName}`}
          </h3>
        </div>

        {isNew && (
          <input
            type="text"
            value={editing.filename}
            onChange={(e) => setEditing({ ...editing, filename: e.target.value })}
            placeholder="filename.md"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
        )}

        <textarea
          value={editing.content}
          onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          className="min-h-[200px] w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs focus:border-primary focus:outline-none"
          spellCheck={false}
        />

        <button
          onClick={handleSave}
          disabled={isSaving || (isNew && !editing.filename.trim())}
          className="btn-primary flex items-center gap-1.5 self-end px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </button>
      </div>
    );
  }

  // Filter by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredFiles = q
    ? files.filter((f) => f.filename.toLowerCase().includes(q))
    : files;
  const filteredPluginItems = q
    ? pluginItems.filter((i) => i.filename.toLowerCase().includes(q) || i.pluginName.toLowerCase().includes(q))
    : pluginItems;

  // List view
  const hasUserFiles = filteredFiles.length > 0;
  const hasPluginItems = filteredPluginItems.length > 0;
  const hasNothing = !hasUserFiles && !hasPluginItems;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          {icon}
          {title}
        </h3>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          style={{ minHeight: '36px' }}
        >
          <Plus className="h-4 w-4 text-primary" />
          {addLabel}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {description}
      </p>

      {/* Search */}
      {(files.length > 0 || pluginItems.length > 0) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
            className="w-full rounded-lg border border-border bg-muted pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : hasNothing ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{emptyLabel}</p>
      ) : (
        <div className="space-y-5">
          {/* User-created files */}
          {hasUserFiles && (
            <div className="space-y-1">
              {hasPluginItems && (
                <span className="block px-3 pb-1 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Your {title}
                </span>
              )}
              {filteredFiles.map((file) => (
                <div
                  key={file.filename}
                  className="group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <button
                    onClick={() => handleEdit(file)}
                    className="flex items-center gap-2 text-sm min-w-0"
                  >
                    {icon}
                    <span className={`font-mono truncate ${!file.enabled ? 'opacity-50' : ''}`}>
                      {displayPrefix}{file.filename.replace(/\.md$/, '')}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(file)}
                      className="rounded p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title={file.enabled ? 'Disable' : 'Enable'}
                    >
                      {file.enabled
                        ? <ToggleRight className="h-4 w-4 text-primary" />
                        : <ToggleLeft className="h-4 w-4" />
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(file.filename)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Plugin-sourced items (read-only) */}
          {hasPluginItems && (
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 px-3 pb-1 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                <Puzzle className="h-3 w-3" />
                From Plugins
              </span>
              {filteredPluginItems.map((item) => (
                <div
                  key={`${item.pluginName}-${item.filename}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 opacity-70"
                >
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    {icon}
                    <span className={`font-mono truncate ${!item.enabled ? 'opacity-50 line-through' : ''}`}>
                      {displayPrefix}{item.filename.replace(/\.md$/, '')}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/20">
                    {item.pluginName}
                  </span>
                </div>
              ))}
              <p className="px-3 pt-1 text-[10px] text-muted-foreground/50">
                Manage plugin items in Settings &gt; Plugins
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
