import { useMemo, useState, useEffect } from 'react';
import { X, Search, Plus, Loader2, RefreshCw, ExternalLink, Check, Trash2, FolderGit2 } from 'lucide-react';
import { useMarketplace, type StatusTab } from '@/hooks/useMarketplace';
import { catalog } from '@/lib/generated/plugin-catalog';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import { MarketplaceFilters } from './MarketplaceFilters';
import { MarketplaceGrid } from './MarketplaceGrid';
import { CardSizeToggle } from './CardSizeToggle';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function MarketplacePage() {
  const {
    closeMarketplace,
    searchQuery,
    setSearchQuery,
    statusTab,
    setStatusTab,
    cardSize,
    setCardSize,
    selectedSource,
    setSelectedSource,
    selectedCategories,
    toggleCategory,
    selectedTypes,
    toggleType,
    selectedCompatibility,
    setSelectedCompatibility,
    clearFilters,
    installedRepoUrls,
    favoriteRepoUrls,
    installing,
    installError,
    clearInstallError,
    installPlugin,
    uninstallPlugin,
    toggleFavorite,
    discoveredPlugin,
    isDiscovering,
    discoverError,
    discoverFromUrl,
    clearDiscovered,
    installDiscovered,
    isRefreshing,
    refreshInstalled,
    customSources,
    customCatalog,
    isLoadingSources,
    sourcesRefreshedAt,
    addSource,
    removeSource,
    refreshSources,
  } = useMarketplace();

  const [showAddUrl, setShowAddUrl] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Merge static + custom catalogs
  const mergedCatalog = useMemo(
    () => [...catalog, ...customCatalog],
    [customCatalog]
  );

  const totalCount = mergedCatalog.length;

  // Derive installed and favorites count
  const installedCount = useMemo(() => {
    let count = 0;
    for (const p of mergedCatalog) {
      if (installedRepoUrls.has(p.repository_url)) count++;
    }
    return count;
  }, [installedRepoUrls, mergedCatalog]);

  const favoritesCount = useMemo(() => {
    let count = 0;
    for (const p of mergedCatalog) {
      if (favoriteRepoUrls.has(p.repository_url)) count++;
    }
    return count;
  }, [favoriteRepoUrls, mergedCatalog]);

  // Filter the catalog
  const filtered: CatalogPlugin[] = useMemo(() => {
    let result = mergedCatalog;

    // Status tab filter
    if (statusTab === 'installed') {
      result = result.filter((p) => installedRepoUrls.has(p.repository_url));
    } else if (statusTab === 'favorites') {
      result = result.filter((p) => favoriteRepoUrls.has(p.repository_url));
    }

    // Source filter
    if (selectedSource !== 'all') {
      result = result.filter((p) => p.source_id === selectedSource);
    }

    // Category filter
    if (selectedCategories.length > 0) {
      result = result.filter((p) =>
        p.categories.some((c) => selectedCategories.includes(c))
      );
    }

    // Type filter
    if (selectedTypes.length > 0) {
      result = result.filter((p) => {
        const typeMap: Record<string, number> = {
          agent: p.agent_count,
          skill: p.skill_count,
          command: p.command_count,
          rule: p.rule_count,
        };
        return selectedTypes.some((t) => (typeMap[t] || 0) > 0);
      });
    }

    // Compatibility filter
    if (selectedCompatibility !== 'all') {
      result = result.filter(
        (p) => p.compatibility === selectedCompatibility
      );
    }

    // Search
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.author && p.author.toLowerCase().includes(q)) ||
          p.categories.some((c) => c.toLowerCase().includes(q))
      );
    }

    return result;
  }, [
    mergedCatalog,
    statusTab,
    selectedSource,
    selectedCategories,
    selectedTypes,
    selectedCompatibility,
    debouncedQuery,
    installedRepoUrls,
    favoriteRepoUrls,
  ]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMarketplace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMarketplace]);

  const STATUS_TABS: Array<{ key: StatusTab; label: string; count: number }> = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'installed', label: 'Installed', count: installedCount },
    { key: 'favorites', label: 'Favorites', count: favoritesCount },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(215,25%,7%)]">
      {/* Header area */}
      <div className="shrink-0 border-b border-white/[0.06] px-4 sm:px-6 py-4 sm:py-5 safe-area-header">
        {/* Title (left) + Close (right) */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-2xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Plugin Catalog
            </h1>
            <p className="text-sm text-[hsl(180,5%,50%)] mt-0.5">
              Browse and manage {totalCount} Claude Code plugins
            </p>
          </div>
          <button
            onClick={closeMarketplace}
            className="flex items-center justify-center rounded-md text-[hsl(180,5%,55%)] transition-colors hover:bg-white/[0.06] hover:text-cyan-400"
            style={{ minHeight: '44px', minWidth: '44px' }}
            title="Close (Escape)"
            aria-label="Close plugin catalog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 mb-4">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 border ${
                statusTab === tab.key
                  ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_-2px_hsl(185,95%,55%,0.2)]'
                  : 'bg-white/[0.03] text-[hsl(180,5%,55%)] hover:text-[hsl(180,5%,80%)] border-white/[0.06] hover:border-white/[0.1]'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Search Bar + Controls */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(180,5%,40%)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-[hsl(180,5%,90%)] placeholder:text-[hsl(180,5%,35%)] focus:outline-none focus:border-cyan-500/40 focus:shadow-[0_0_12px_-2px_hsl(185,95%,55%,0.15)] transition-all duration-200"
              style={{ fontSize: '16px' }}
              autoFocus
            />
          </div>
          <CardSizeToggle size={cardSize} onChange={setCardSize} />

          {/* Refresh Installed (only on Installed tab) */}
          {statusTab === 'installed' && (
            <button
              onClick={async () => {
                const result = await refreshInstalled();
                setRefreshToast(`Refreshed ${result.refreshed} plugin${result.refreshed !== 1 ? 's' : ''}`);
                setTimeout(() => setRefreshToast(null), 3000);
              }}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[hsl(180,5%,65%)] transition-all hover:border-cyan-500/30 hover:text-cyan-400 disabled:opacity-50"
              title="Refresh installed plugins from GitHub"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {/* Add Plugin button */}
          <button
            onClick={() => {
              setShowAddUrl(!showAddUrl);
              if (showAddUrl) {
                setAddUrl('');
                clearDiscovered();
              }
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
              showAddUrl
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                : 'border-white/[0.08] bg-white/[0.03] text-[hsl(180,5%,65%)] hover:border-cyan-500/30 hover:text-cyan-400'
            }`}
            title="Add plugin from GitHub URL"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Plugin</span>
          </button>
        </div>

        {/* URL Discovery Bar */}
        {showAddUrl && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && addUrl.trim()) {
                    discoverFromUrl(addUrl.trim());
                  }
                }}
                placeholder="Paste a GitHub URL... (e.g. https://github.com/user/repo)"
                className="flex-1 rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-2.5 text-sm text-[hsl(180,5%,90%)] placeholder:text-[hsl(180,5%,35%)] focus:outline-none focus:border-violet-500/40 transition-all"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={() => addUrl.trim() && discoverFromUrl(addUrl.trim())}
                disabled={isDiscovering || !addUrl.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 px-4 py-2.5 text-sm font-medium text-violet-400 transition-all hover:bg-violet-500/25 disabled:opacity-50"
              >
                {isDiscovering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Discover
              </button>
            </div>

            {/* Discover error */}
            {discoverError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                <span className="flex-1">{discoverError}</span>
                <button onClick={clearDiscovered} className="hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Discovered plugin preview */}
            {discoveredPlugin && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                      <h4 className="font-semibold text-[hsl(180,5%,95%)] truncate">
                        {discoveredPlugin.name}
                      </h4>
                    </div>
                    {discoveredPlugin.description && (
                      <p className="text-sm text-[hsl(180,5%,55%)] mt-1 line-clamp-2">
                        {discoveredPlugin.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-[hsl(180,5%,50%)]">
                      {discoveredPlugin.agents && discoveredPlugin.agents.length > 0 && (
                        <span>{discoveredPlugin.agents.length} agent{discoveredPlugin.agents.length !== 1 ? 's' : ''}</span>
                      )}
                      {discoveredPlugin.commands && discoveredPlugin.commands.length > 0 && (
                        <span>{discoveredPlugin.commands.length} command{discoveredPlugin.commands.length !== 1 ? 's' : ''}</span>
                      )}
                      {discoveredPlugin.rules && discoveredPlugin.rules.length > 0 && (
                        <span>{discoveredPlugin.rules.length} rule{discoveredPlugin.rules.length !== 1 ? 's' : ''}</span>
                      )}
                      {discoveredPlugin.repoUrl && (
                        <a
                          href={discoveredPlugin.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-violet-400 hover:text-violet-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                          GitHub
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={clearDiscovered}
                      className="rounded px-3 py-1.5 text-sm text-[hsl(180,5%,55%)] hover:text-[hsl(180,5%,80%)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={installDiscovered}
                      className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-4 py-1.5 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-500/25 hover:shadow-[0_0_12px_-2px_hsl(185,95%,55%,0.3)]"
                    >
                      Install
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body: sidebar + grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Filters sidebar (desktop) */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/[0.06] p-5 lg:block" style={{ overscrollBehavior: 'contain' }}>
          <MarketplaceFilters
            catalog={mergedCatalog}
            selectedSource={selectedSource}
            selectedCategories={selectedCategories}
            selectedTypes={selectedTypes}
            selectedCompatibility={selectedCompatibility}
            onSourceChange={setSelectedSource}
            onCategoryToggle={toggleCategory}
            onTypeToggle={toggleType}
            onCompatibilityChange={setSelectedCompatibility}
            onClearAll={clearFilters}
            customSources={customSources}
            onRemoveSource={removeSource}
          />

          {/* Source Management */}
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-[hsl(180,5%,45%)] uppercase tracking-wider">
                Custom Sources
              </div>
              <button
                onClick={() => setShowSources(!showSources)}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {showSources ? 'Hide' : 'Manage'}
              </button>
            </div>

            {showSources && (
              <div className="flex flex-col gap-3">
                {/* Add source form */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newSourceUrl}
                    onChange={(e) => {
                      setNewSourceUrl(e.target.value);
                      setSourceError(null);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newSourceUrl.trim()) {
                        try {
                          await addSource(newSourceUrl.trim());
                          setNewSourceUrl('');
                        } catch (err) {
                          setSourceError(err instanceof Error ? err.message : 'Failed');
                        }
                      }
                    }}
                    placeholder="github.com/..."
                    className="flex-1 min-w-0 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-xs text-[hsl(180,5%,90%)] placeholder:text-[hsl(180,5%,30%)] focus:outline-none focus:border-cyan-500/40"
                  />
                  <button
                    onClick={async () => {
                      if (!newSourceUrl.trim()) return;
                      try {
                        await addSource(newSourceUrl.trim());
                        setNewSourceUrl('');
                      } catch (err) {
                        setSourceError(err instanceof Error ? err.message : 'Failed');
                      }
                    }}
                    disabled={isLoadingSources || !newSourceUrl.trim()}
                    className="shrink-0 rounded bg-cyan-500/10 border border-cyan-500/20 px-2 py-1.5 text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {isLoadingSources ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {sourceError && (
                  <p className="text-xs text-red-400">{sourceError}</p>
                )}

                {/* Source list */}
                {customSources.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {customSources.map((source) => {
                      const count = customCatalog.filter(
                        (p) => p.source_id === `custom:${source.id}`
                      ).length;
                      return (
                        <div
                          key={source.id}
                          className="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-white/[0.03]"
                        >
                          <FolderGit2 className="h-3 w-3 text-emerald-400 shrink-0" />
                          <span className="flex-1 text-xs text-[hsl(180,5%,65%)] truncate">
                            {source.label}
                          </span>
                          <span className="text-[10px] text-[hsl(180,5%,35%)]">{count}</span>
                          <button
                            onClick={() => removeSource(source.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[hsl(180,5%,35%)]">No custom sources added</p>
                )}

                {/* Refresh sources */}
                {customSources.length > 0 && (
                  <button
                    onClick={refreshSources}
                    disabled={isLoadingSources}
                    className="flex items-center justify-center gap-1.5 rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[hsl(180,5%,55%)] hover:text-cyan-400 hover:border-cyan-500/20 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingSources ? 'animate-spin' : ''}`} />
                    Refresh Sources
                  </button>
                )}

                {sourcesRefreshedAt && (
                  <p className="text-[10px] text-[hsl(180,5%,30%)]">
                    Last refreshed: {new Date(sourcesRefreshedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main grid area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Install error banner */}
          {installError && (
            <div className="shrink-0 mx-4 sm:mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              <span className="flex-1">{installError}</span>
              <button
                onClick={clearInstallError}
                className="flex items-center justify-center rounded p-0.5 hover:bg-red-500/20 transition-colors"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Count */}
          <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2">
            <div className="text-sm text-[hsl(180,5%,45%)]">
              {filtered.length} plugin{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-5 safe-bottom" style={{ overscrollBehavior: 'contain' }}>
            <MarketplaceGrid
              plugins={filtered}
              installedRepoUrls={installedRepoUrls}
              favoriteRepoUrls={favoriteRepoUrls}
              installing={installing}
              cardSize={cardSize}
              onInstall={installPlugin}
              onUninstall={uninstallPlugin}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        </div>
      </div>

      {/* Refresh toast */}
      {refreshToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-cyan-500/30 bg-[hsl(215,22%,11%)] px-4 py-2.5 text-sm text-cyan-400 shadow-lg shadow-cyan-500/10 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            {refreshToast}
          </div>
        </div>
      )}
    </div>
  );
}
