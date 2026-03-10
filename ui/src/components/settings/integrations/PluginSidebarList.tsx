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
      <div className="shrink-0 border-b border-[#21262d] px-3 py-2">
        <div className="flex items-center gap-2 rounded-[6px] border border-[#30363d] bg-[#1c2128] px-[10px] py-[6px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#768390" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={pluginSearch}
            onChange={(e) => setPluginSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full bg-transparent font-['Space_Mono'] text-[11px] text-foreground focus-visible:outline-none placeholder:text-[#768390]"
          />
        </div>
      </div>

      {/* Tier groups */}
      <div className="flex-1 overflow-y-auto pt-[16px]">
        {TIER_ORDER.map((tier) => {
          const items = grouped[tier];
          const cfg = TIER_CONFIG[tier];
          const collapsed = tierCollapsed[tier] ?? false;

          return (
            <div key={tier}>
              {/* Tier header */}
              <button
                className="flex w-full items-center justify-between px-[14px] pt-[8px] pb-[5px] transition-colors hover:bg-[#1c2128]/50"
                onClick={() => toggleTier(tier)}
              >
                <span className="font-['Space_Mono'] text-[9px] font-bold uppercase tracking-[1.2px] text-[#4b535d]">
                  {cfg.label}{' '}
                  <span className="font-bold text-[#4b535d]">{items.length}</span>
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#4b535d"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Items */}
              {!collapsed &&
                items.map((plugin) => (
                  <PluginSidebarRow
                    key={plugin.id}
                    plugin={plugin}
                    isActive={selectedPluginId === plugin.id}
                    onSelect={() => selectPlugin(plugin.id)}
                    onToggle={() => togglePlugin(plugin.id)}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {/* Add Plugins button */}
      <div className="shrink-0 px-3 pb-3">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-4 py-3 font-['Space_Mono'] text-[11px] font-bold text-[#768390] transition-colors hover:border-[#00e5ff33] hover:text-[#00e5ff]"
          onClick={() => setShowMarketplace(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Plugins
        </button>
      </div>
    </div>
  );
}
