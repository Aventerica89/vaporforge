import { useMemo, useState, useCallback } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { deriveTier, TIER_CONFIG } from './types';
import type { PluginTier } from './types';
import { PluginSidebarRow } from './PluginSidebarRow';
import type { PluginPackage } from './PluginSidebarRow';
import type { Plugin } from '@/lib/types';

const TIER_ORDER: PluginTier[] = ['official', 'community', 'custom'];

/** Known repo URL patterns → sourceId + sourceName */
const KNOWN_SOURCES: Array<{ pattern: string; id: string; name: string }> = [
  { pattern: 'anthropics/claude-plugins-official', id: 'anthropic-official', name: 'Anthropic Official' },
  { pattern: 'ccplugins/awesome-claude-code-plugins', id: 'awesome-community', name: 'Awesome CC Plugins' },
];

/** Derive sourceId from repoUrl for plugins that predate the sourceId field */
function inferSourceId(plugin: Plugin): { id: string; name: string } {
  if (plugin.sourceId) return { id: plugin.sourceId, name: plugin.sourceName ?? plugin.sourceId };
  const url = plugin.repoUrl ?? '';
  for (const src of KNOWN_SOURCES) {
    if (url.includes(src.pattern)) return { id: src.id, name: src.name };
  }
  return { id: url || 'unknown', name: url ? url.split('/').slice(-2).join('/') : 'Community Plugins' };
}

/** Group plugins into packages by source */
function buildPackages(plugins: Plugin[], tier: PluginTier): PluginPackage[] {
  if (plugins.length === 0) return [];

  if (tier === 'official') {
    return [
      {
        key: 'builtin',
        name: 'Anthropic Official',
        tier: 'official',
        plugins,
      },
    ];
  }

  if (tier === 'custom') {
    return plugins.map((p) => ({
      key: `custom:${p.id}`,
      name: p.name,
      tier: 'custom',
      plugins: [p],
    }));
  }

  // Community: group by sourceId (inferred from repoUrl if missing)
  const bySource = new Map<string, { name: string; plugins: Plugin[] }>();
  for (const p of plugins) {
    const src = inferSourceId(p);
    const existing = bySource.get(src.id);
    if (existing) {
      existing.plugins.push(p);
    } else {
      bySource.set(src.id, { name: src.name, plugins: [p] });
    }
  }

  return Array.from(bySource.entries()).map(([sourceId, group]) => ({
    key: `community:${sourceId}`,
    name: group.name,
    tier: 'community' as PluginTier,
    plugins: group.plugins,
  }));
}

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
    removePlugins,
  } = useIntegrationsStore();

  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((key: string) => {
    setExpandedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

    const byTier: Record<PluginTier, Plugin[]> = {
      official: [],
      community: [],
      custom: [],
    };
    for (const plugin of filtered) {
      byTier[deriveTier(plugin)].push(plugin);
    }

    // Build packages within each tier
    const packages: Record<PluginTier, PluginPackage[]> = {
      official: buildPackages(byTier.official, 'official'),
      community: buildPackages(byTier.community, 'community'),
      custom: buildPackages(byTier.custom, 'custom'),
    };

    return packages;
  }, [plugins, pluginSearch]);

  /** Check if any plugin in a package is currently selected */
  const isPackageActive = (pkg: PluginPackage) =>
    pkg.plugins.some((p) => p.id === selectedPluginId);

  /** Select the first plugin in a package (or the already-selected one) */
  const handleSelectPackage = (pkg: PluginPackage) => {
    const alreadySelected = pkg.plugins.find((p) => p.id === selectedPluginId);
    if (alreadySelected) return; // already viewing a plugin in this package
    selectPlugin(pkg.plugins[0].id);
  };

  /** Toggle all plugins in a package */
  const handleToggleAll = (pkg: PluginPackage) => {
    const allEnabled = pkg.plugins.every((p) => p.enabled);
    // Toggle each plugin that doesn't match the target state
    for (const p of pkg.plugins) {
      if (p.enabled === allEnabled) {
        togglePlugin(p.id);
      }
    }
  };

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
          const packages = grouped[tier];
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
                  <span className="font-bold text-[#4b535d]">{packages.length}</span>
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

              {/* Package rows */}
              {!collapsed &&
                packages.map((pkg) => (
                  <PluginSidebarRow
                    key={pkg.key}
                    pkg={pkg}
                    isActive={isPackageActive(pkg)}
                    isExpanded={expandedPackages.has(pkg.key)}
                    selectedPluginId={selectedPluginId}
                    onSelect={() => handleSelectPackage(pkg)}
                    onToggleExpand={() => toggleExpand(pkg.key)}
                    onToggleAll={() => handleToggleAll(pkg)}
                    onSelectPlugin={selectPlugin}
                    onTogglePlugin={togglePlugin}
                    onRemovePackage={pkg.tier !== 'official' ? () => removePlugins(pkg.plugins) : undefined}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {/* Add Plugins button */}
      <div className="shrink-0 px-3 pb-3">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#30363d] bg-[#161b22] px-[16px] py-[12px] font-['Space_Mono'] text-[11px] font-bold text-[#768390] transition-colors hover:border-[#00e5ff33] hover:text-[#00e5ff]"
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
