import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, X, Search } from 'lucide-react';
import { useMarketplace, type StatusTab } from '@/hooks/useMarketplace';
import { catalog, catalogStats } from '@/lib/generated/plugin-catalog';
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
    installing,
    installError,
    clearInstallError,
    installPlugin,
    uninstallPlugin,
  } = useMarketplace();

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Derive installed count — match on full repository_url (unique per plugin)
  const installedCount = useMemo(() => {
    let count = 0;
    for (const p of catalog) {
      if (installedRepoUrls.has(p.repository_url)) count++;
    }
    return count;
  }, [installedRepoUrls]);

  // Filter the catalog
  const filtered: CatalogPlugin[] = useMemo(() => {
    let result = catalog;

    // Status tab filter
    if (statusTab === 'installed') {
      result = result.filter((p) => installedRepoUrls.has(p.repository_url));
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
    statusTab,
    selectedSource,
    selectedCategories,
    selectedTypes,
    selectedCompatibility,
    debouncedQuery,
    installedRepoUrls,
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
    { key: 'all', label: 'All', count: catalogStats.total },
    { key: 'installed', label: 'Installed', count: installedCount },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(215,25%,7%)]">
      {/* Header area */}
      <div className="shrink-0 border-b border-white/[0.06] px-6 py-5 safe-area-header">
        {/* Back + Title */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={closeMarketplace}
            className="rounded-md p-1.5 text-[hsl(180,5%,55%)] transition-colors hover:bg-white/[0.06] hover:text-cyan-400"
            style={{ minHeight: '44px', minWidth: '44px' }}
            title="Back (Escape)"
            aria-label="Back to main view"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1
              className="text-2xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Plugin Catalog
            </h1>
            <p className="text-sm text-[hsl(180,5%,50%)] mt-0.5">
              Browse and manage {catalogStats.total} Claude Code plugins
            </p>
          </div>
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
        <div className="flex items-center gap-4">
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
        </div>
      </div>

      {/* Body: sidebar + grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Filters sidebar (desktop) */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/[0.06] p-5 lg:block">
          <MarketplaceFilters
            selectedSource={selectedSource}
            selectedCategories={selectedCategories}
            selectedTypes={selectedTypes}
            selectedCompatibility={selectedCompatibility}
            onSourceChange={setSelectedSource}
            onCategoryToggle={toggleCategory}
            onTypeToggle={toggleType}
            onCompatibilityChange={setSelectedCompatibility}
            onClearAll={clearFilters}
          />
        </aside>

        {/* Main grid area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Install error banner */}
          {installError && (
            <div className="shrink-0 mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              <span className="flex-1">{installError}</span>
              <button
                onClick={clearInstallError}
                className="rounded p-0.5 hover:bg-red-500/20 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Count */}
          <div className="shrink-0 px-5 pt-4 pb-2">
            <div className="text-sm text-[hsl(180,5%,45%)]">
              {filtered.length} plugin{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ overscrollBehavior: 'contain' }}>
            <MarketplaceGrid
              plugins={filtered}
              installedRepoUrls={installedRepoUrls}
              installing={installing}
              cardSize={cardSize}
              onInstall={installPlugin}
              onUninstall={uninstallPlugin}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
