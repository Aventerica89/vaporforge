import { useMemo } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { deriveTier, TIER_CONFIG } from './types';
import type { PluginTier } from './types';
import { PluginSidebarRow } from './PluginSidebarRow';
import type { Plugin } from '@/lib/types';

const TIER_ORDER: PluginTier[] = ['official', 'community', 'custom'];

export function PluginSidebarList() {
  const {
    plugins,
    pluginSearch,
    setPluginSearch,
    selectedPluginId,
    selectPlugin,
    togglePlugin,
    tierCollapsed,
    toggleTier,
    pluginScopes,
    setShowMarketplace,
  } = useIntegrationsStore();

  const grouped = useMemo(() => {
    const search = pluginSearch.toLowerCase().trim();
    const filtered = search
      ? plugins.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.description?.toLowerCase().includes(search) ||
            p.id.toLowerCase().includes(search)
        )
      : plugins;

    const groups: Record<PluginTier, Plugin[]> = {
      official: [],
      community: [],
      custom: [],
    };
    for (const plugin of filtered) {
      groups[deriveTier(plugin)].push(plugin);
    }
    return groups;
  }, [plugins, pluginSearch]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="shrink-0 border-b border-border/40 px-3 py-2">
        <input
          type="text"
          value={pluginSearch}
          onChange={(e) => setPluginSearch(e.target.value)}
          placeholder="Search plugins..."
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {/* Tier groups */}
      <div className="flex-1 overflow-y-auto pb-4 pt-1">
        {TIER_ORDER.map((tier) => {
          const items = grouped[tier];
          const cfg = TIER_CONFIG[tier];
          const collapsed = tierCollapsed[tier] ?? false;

          return (
            <div key={tier}>
              {/* Tier header */}
              <button
                className="flex w-full items-center justify-between px-3.5 pb-1 pt-2 transition-colors hover:bg-card/40"
                onClick={() => toggleTier(tier)}
              >
                <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  {cfg.label}
                  <span className="rounded-full bg-card px-1.5 py-px text-[9px] font-normal text-muted-foreground">
                    {items.length}
                  </span>
                </span>
                <span
                  className={`text-[9px] text-muted-foreground transition-transform ${
                    collapsed ? '' : 'rotate-90'
                  }`}
                >
                  &#9658;
                </span>
              </button>

              {/* Items */}
              {!collapsed && (
                <div>
                  {items.map((plugin) => (
                    <PluginSidebarRow
                      key={plugin.id}
                      plugin={plugin}
                      isActive={selectedPluginId === plugin.id}
                      onSelect={() => selectPlugin(plugin.id)}
                      onToggle={() => togglePlugin(plugin.id)}
                      scopeIndicator={pluginScopes[plugin.id] === 'project'}
                    />
                  ))}
                  <button
                    className="flex w-full items-center gap-1.5 px-3.5 py-1 pl-5 text-[10px] text-muted-foreground transition-colors hover:text-primary"
                    onClick={() => setShowMarketplace(true)}
                  >
                    + Add Plugins
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
