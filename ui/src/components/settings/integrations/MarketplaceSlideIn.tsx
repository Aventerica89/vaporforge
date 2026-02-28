import { useState, useMemo } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { useMarketplace } from '@/hooks/useMarketplace';
import { TIER_CONFIG } from './types';
import type { PluginTier } from './types';

import { catalog as BUILTIN_CATALOG } from '@/lib/generated/plugin-catalog';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';

type MktTab = 'all' | 'official' | 'community';

export function MarketplaceSlideIn() {
  const { showMarketplace, setShowMarketplace, plugins } =
    useIntegrationsStore();
  const { installPlugin, installing, customCatalog } = useMarketplace();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<MktTab>('all');

  const catalog = useMemo(() => {
    const builtIn = BUILTIN_CATALOG.map((c) => ({
      ...c,
      tier: 'official' as PluginTier,
    }));
    const custom = (customCatalog as unknown as CatalogPlugin[]).map((c) => ({
      ...c,
      tier: 'community' as PluginTier,
    }));
    return [...builtIn, ...custom];
  }, [customCatalog]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return catalog.filter((c) => {
      if (tab !== 'all' && c.tier !== tab) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.description?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, search, tab]);

  const installedUrls = useMemo(
    () => new Set(plugins.filter((p) => p.repoUrl).map((p) => p.repoUrl!)),
    [plugins]
  );

  if (!showMarketplace) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] ${showMarketplace ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-250"
        onClick={() => setShowMarketplace(false)}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 flex w-[480px] flex-col border-l border-border bg-card/95 backdrop-blur-sm animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4.5">
          <span className="text-xs font-bold tracking-widest text-foreground">
            Marketplace
          </span>
          <button
            className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowMarketplace(false)}
          >
            [close]
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-border/40 px-3.5 py-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        {/* Tab row */}
        <div className="flex shrink-0 gap-px border-b border-border/40 px-3.5 py-2">
          {(['all', 'official', 'community'] as const).map((t) => (
            <button
              key={t}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-all ${
                tab === t
                  ? 'border-border bg-card text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(t)}
            >
              {t === 'all' ? 'All' : t === 'official' ? 'Official' : 'Community'}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3.5">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[11px] text-muted-foreground">
              No plugins found
            </p>
          )}
          {filtered.map((c) => {
            const isInstalled = !!(c.repository_url && installedUrls.has(c.repository_url));
            const isInstalling = installing.has(c.id);
            const tierCfg = TIER_CONFIG[c.tier];

            return (
              <div
                key={c.id}
                className="flex gap-2.5 rounded-md border border-border/40 bg-card/80 p-3 transition-colors hover:border-border"
              >
                <span className="mt-0.5 w-6 shrink-0 text-center font-mono text-[11px] font-bold text-muted-foreground">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-xs font-bold text-foreground">
                    {c.name}
                  </div>
                  <div className="mb-1 flex gap-1.5">
                    <span
                      className={`inline-block rounded-sm border px-1 py-px text-[8px] font-bold tracking-wide ${tierCfg.badgeClass}`}
                    >
                      {c.tier}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                </div>
                <button
                  className={`shrink-0 self-start rounded-sm border px-2.5 py-0.5 font-mono text-[9px] transition-all ${
                    isInstalled
                      ? 'cursor-default border-border text-muted-foreground/40'
                      : isInstalling
                        ? 'animate-pulse border-primary/30 bg-primary/10 text-primary/60'
                        : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                  disabled={isInstalled || isInstalling}
                  onClick={() => {
                    if (!isInstalled && !isInstalling && c.repository_url) {
                      installPlugin(c as any);
                    }
                  }}
                >
                  {isInstalled ? 'installed' : isInstalling ? '...' : 'install'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
