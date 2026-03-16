import { useState, useMemo, useEffect } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { useMarketplace } from '@/hooks/useMarketplace';
import { TIER_CONFIG } from './types';
import type { PluginTier } from './types';

import type { CatalogPlugin } from '@/lib/generated/catalog-types';

// ---------------------------------------------------------------------------
// View A — Marketplace List
// ---------------------------------------------------------------------------

interface MarketplaceListViewProps {
  onSelectSource: (id: string) => void;
  onClose: () => void;
}

function MarketplaceListView({ onSelectSource, onClose }: MarketplaceListViewProps) {
  const {
    customSources,
    customCatalog,
    isLoadingSources,
    sourcesRefreshedAt,
    sourceWarnings,
    addSource,
    removeSource,
    patchSource,
    refreshSources,
  } = useMarketplace();
  const { plugins } = useIntegrationsStore();

  const [urlInput, setUrlInput] = useState('');
  const [urlAdding, setUrlAdding] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Derive per-source counts from installed plugins + catalog
  const sourceMeta = useMemo(() => {
    const meta: Record<string, { available: number; installed: number }> = {};
    for (const src of customSources) {
      const sourceKey = `custom:${src.id}`;
      const available = customCatalog.filter((p) => p.source_id === sourceKey).length;
      const installed = plugins.filter((p) => p.sourceId === sourceKey).length;
      meta[src.id] = { available, installed };
    }
    return meta;
  }, [customSources, customCatalog, plugins]);

  async function handleAddSource() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlAdding(true);
    setUrlError(null);
    try {
      await addSource(url);
      setUrlInput('');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to add marketplace');
    } finally {
      setUrlAdding(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4.5">
        <span className="text-xs font-bold tracking-widest text-foreground">
          Marketplaces
        </span>
        <button
          className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={onClose}
        >
          [close]
        </button>
      </div>

      {/* Add Marketplace input */}
      <div className="shrink-0 border-b border-border/40 px-3.5 py-2.5">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Add Marketplace
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !urlAdding) handleAddSource();
            }}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            className={`shrink-0 rounded-sm border px-2.5 py-1 font-mono text-[10px] transition-all ${
              urlAdding
                ? 'animate-pulse border-primary/30 bg-primary/10 text-primary/60'
                : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
            }`}
            disabled={urlAdding || !urlInput.trim()}
            onClick={handleAddSource}
          >
            {urlAdding ? '...' : 'add'}
          </button>
        </div>
        {urlError && (
          <p className="mt-1 font-mono text-[10px] text-red-400">{urlError}</p>
        )}
      </div>

      {/* Source list */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3.5">
        {customSources.length === 0 && !isLoadingSources && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="mb-1 font-mono text-[11px] text-muted-foreground">
              No marketplaces added
            </p>
            <p className="font-mono text-[10px] text-muted-foreground/60">
              Add a GitHub repo URL above to browse its plugins
            </p>
          </div>
        )}

        {customSources.map((src) => {
          const counts = sourceMeta[src.id] ?? { available: 0, installed: 0 };
          return (
            <div
              key={src.id}
              className="group flex flex-col gap-2 rounded-md border border-border/40 bg-card/80 p-3 transition-colors hover:border-border"
            >
              <div className="flex items-start gap-2">
                {/* Icon */}
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border/60 font-mono text-[10px] font-bold text-muted-foreground">
                  {src.label.charAt(0).toUpperCase()}
                </span>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 truncate text-xs font-bold text-foreground">
                    {src.label}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
                    <span>{counts.available} available</span>
                    <span>·</span>
                    <span>{counts.installed} installed</span>
                    {sourcesRefreshedAt && (
                      <>
                        <span>·</span>
                        <span>
                          updated{' '}
                          {new Date(sourcesRefreshedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Browse button */}
                <button
                  className="shrink-0 rounded-sm border border-border/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-all hover:border-primary/30 hover:text-primary"
                  onClick={() => onSelectSource(src.id)}
                >
                  browse
                </button>
              </div>

              {/* Warning row */}
              {sourceWarnings[src.id]?.length > 0 && (
                <p className="font-mono text-[9px] text-amber-400/80">
                  ⚠ {sourceWarnings[src.id][0]}
                </p>
              )}

              {/* Actions row */}
              <div className="flex items-center justify-between border-t border-border/20 pt-2">
                {/* Auto-update toggle */}
                <button
                  className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => patchSource(src.id, { autoUpdate: !src.autoUpdate })}
                  title="Toggle auto-update"
                >
                  <span
                    className={`inline-block h-2.5 w-4 rounded-full border transition-colors ${
                      src.autoUpdate
                        ? 'border-primary/50 bg-primary/30'
                        : 'border-border bg-transparent'
                    }`}
                  />
                  auto-update
                </button>

                {/* Update + Remove */}
                <div className="flex gap-2">
                  <button
                    className={`font-mono text-[9px] transition-colors ${
                      isLoadingSources
                        ? 'animate-pulse text-primary/60'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    disabled={isLoadingSources}
                    onClick={refreshSources}
                  >
                    {isLoadingSources ? 'updating...' : 'update'}
                  </button>
                  <button
                    className="font-mono text-[9px] text-muted-foreground/60 transition-colors hover:text-red-400"
                    onClick={() => removeSource(src.id)}
                  >
                    remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// View B — Source Plugin Grid
// ---------------------------------------------------------------------------

interface SourceDetailViewProps {
  sourceId: string;
  onBack: () => void;
}

function SourceDetailView({ sourceId, onBack }: SourceDetailViewProps) {
  const { customSources, customCatalog, installing, installPlugin, installedRepoUrls, sourceWarnings } = useMarketplace();

  const [search, setSearch] = useState('');

  const source = customSources.find((s) => s.id === sourceId);
  const sourceKey = `custom:${sourceId}`;

  const sourcePlugins = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customCatalog.filter((p) => {
      if (p.source_id !== sourceKey) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.description?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customCatalog, sourceKey, search]);

  return (
    <>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4.5">
        <button
          className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={onBack}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          back
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
          {source?.label ?? sourceId}
        </span>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border/40 px-3.5 py-2.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search plugins..."
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors placeholder:text-muted-foreground focus-visible:border-primary"
        />
      </div>

      {/* Plugin grid */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3.5">
        {sourcePlugins.length === 0 && (
          <div className="py-8 text-center">
            {search ? (
              <p className="text-[11px] text-muted-foreground">No plugins match your search</p>
            ) : sourceWarnings[sourceId]?.length > 0 ? (
              <div className="flex flex-col items-center gap-1">
                <p className="font-mono text-[10px] text-amber-400/80">⚠ {sourceWarnings[sourceId][0]}</p>
                {sourceWarnings[sourceId].length > 1 && (
                  <p className="font-mono text-[10px] text-muted-foreground">{sourceWarnings[sourceId][1]}</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No plugins found in this marketplace</p>
            )}
          </div>
        )}
        {sourcePlugins.map((c) => {
          const isInstalled = !!(c.repository_url && installedRepoUrls.has(c.repository_url));
          const isInstalling = installing.has(c.id);
          const tier: PluginTier = 'community';
          const tierCfg = TIER_CONFIG[tier];

          const commandAndSkillCount = c.command_count + (c.skill_count ?? 0);
          const counts = [
            c.agent_count > 0 && `${c.agent_count}a`,
            commandAndSkillCount > 0 && `${commandAndSkillCount}c`,
            c.rule_count > 0 && `${c.rule_count}r`,
          ].filter(Boolean).join(' ');

          return (
            <div
              key={c.id}
              className="flex gap-2.5 rounded-md border border-border/40 bg-card/80 p-3 transition-colors hover:border-border"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border/60 font-mono text-[10px] font-bold text-muted-foreground">
                {c.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-xs font-bold text-foreground">
                  {c.name}
                </div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className={`inline-block rounded-sm border px-1 py-px text-[8px] font-bold tracking-wide ${tierCfg.badgeClass}`}
                  >
                    community
                  </span>
                  {counts && (
                    <span className="font-mono text-[9px] text-muted-foreground/60">
                      {counts}
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </div>
              <button
                className={`shrink-0 self-start rounded-sm border px-2.5 py-0.5 font-mono text-[10px] transition-all ${
                  isInstalled
                    ? 'cursor-default border-border text-muted-foreground/40'
                    : isInstalling
                      ? 'animate-pulse border-primary/30 bg-primary/10 text-primary/60'
                      : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                }`}
                disabled={isInstalled || isInstalling}
                onClick={() => {
                  if (!isInstalled && !isInstalling) {
                    installPlugin(c as unknown as CatalogPlugin);
                  }
                }}
              >
                {isInstalled ? 'installed' : isInstalling ? '...' : 'install'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root: MarketplaceSlideIn
// ---------------------------------------------------------------------------

export function MarketplaceSlideIn() {
  const { showMarketplace, setShowMarketplace } = useIntegrationsStore();
  const { loadCustomSources, syncInstalledPlugins } = useMarketplace();

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Load sources + sync installed state whenever the panel opens
  useEffect(() => {
    if (showMarketplace) {
      loadCustomSources();
      syncInstalledPlugins();
    } else {
      // Reset to list view when closing
      setSelectedSourceId(null);
    }
  }, [showMarketplace, loadCustomSources, syncInstalledPlugins]);

  if (!showMarketplace) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-250"
        onClick={() => setShowMarketplace(false)}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 flex w-[480px] max-w-[90vw] flex-col border-l border-border bg-card/95 backdrop-blur-sm animate-in slide-in-from-right duration-250">
        {selectedSourceId === null ? (
          <MarketplaceListView
            onSelectSource={setSelectedSourceId}
            onClose={() => setShowMarketplace(false)}
          />
        ) : (
          <SourceDetailView
            sourceId={selectedSourceId}
            onBack={() => setSelectedSourceId(null)}
          />
        )}
      </div>
    </div>
  );
}
