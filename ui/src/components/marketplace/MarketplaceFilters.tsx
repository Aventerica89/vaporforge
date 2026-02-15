import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import { useMemo } from 'react';
import { Check, Trash2 } from 'lucide-react';
import type { PluginSource } from '@/lib/api';

interface MarketplaceFiltersProps {
  catalog: CatalogPlugin[];
  selectedSource: string;
  selectedCategories: string[];
  selectedTypes: string[];
  selectedCompatibility: 'all' | 'cloud-ready' | 'relay-required';
  onSourceChange: (source: string) => void;
  onCategoryToggle: (category: string) => void;
  onTypeToggle: (type: string) => void;
  onCompatibilityChange: (c: 'all' | 'cloud-ready' | 'relay-required') => void;
  onClearAll: () => void;
  customSources?: PluginSource[];
  onRemoveSource?: (id: string) => void;
}

const STATIC_SOURCES = [
  { id: 'anthropic-official', label: 'Anthropic Official' },
  { id: 'awesome-community', label: 'Community' },
];

const TYPES = ['agent', 'skill', 'command', 'rule'] as const;

function FilterCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ${
        checked
          ? 'border-cyan-500 bg-cyan-500 shadow-[0_0_6px_hsl(185,95%,55%,0.3)]'
          : 'border-white/20 bg-transparent hover:border-white/30'
      }`}
    >
      {checked && <Check className="h-3 w-3 text-[hsl(215,25%,8%)]" strokeWidth={3} />}
    </div>
  );
}

export function MarketplaceFilters({
  catalog,
  selectedSource,
  selectedCategories,
  selectedTypes,
  selectedCompatibility,
  onSourceChange,
  onCategoryToggle,
  onTypeToggle,
  onCompatibilityChange,
  onClearAll,
  customSources = [],
  onRemoveSource,
}: MarketplaceFiltersProps) {
  const categories = useMemo(() => {
    const catCounts = new Map<string, number>();
    for (const plugin of catalog) {
      for (const cat of plugin.categories) {
        catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
      }
    }
    return [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [catalog]);

  const typeCounts = useMemo(() => {
    const counts = { agent: 0, skill: 0, command: 0, rule: 0 };
    for (const p of catalog) {
      if (p.agent_count > 0) counts.agent++;
      if (p.skill_count > 0) counts.skill++;
      if (p.command_count > 0) counts.command++;
      if (p.rule_count > 0) counts.rule++;
    }
    return counts;
  }, [catalog]);

  // Build dynamic source counts
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalog) {
      counts.set(p.source_id, (counts.get(p.source_id) || 0) + 1);
    }
    return counts;
  }, [catalog]);

  const hasActiveFilters =
    selectedSource !== 'all' ||
    selectedCategories.length > 0 ||
    selectedTypes.length > 0 ||
    selectedCompatibility !== 'all';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[hsl(180,5%,90%)] tracking-wide text-sm uppercase">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Source */}
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-[hsl(180,5%,45%)] uppercase tracking-wider">Source</div>
        <div className="flex flex-col gap-2">
          {STATIC_SOURCES.map((source) => {
            const count = sourceCounts.get(source.id) || 0;
            const checked = selectedSource === source.id;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onSourceChange(checked ? 'all' : source.id)}
                className="flex items-center gap-2.5 cursor-pointer group text-left"
              >
                <FilterCheckbox checked={checked} />
                <span className="text-sm text-[hsl(180,5%,65%)] group-hover:text-[hsl(180,5%,90%)] transition-colors flex-1">
                  {source.label}
                </span>
                <span className="text-xs text-[hsl(180,5%,35%)]">{count}</span>
              </button>
            );
          })}
          {customSources.map((source) => {
            const sourceId = `custom:${source.id}`;
            const count = sourceCounts.get(sourceId) || 0;
            const checked = selectedSource === sourceId;
            return (
              <div key={source.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSourceChange(checked ? 'all' : sourceId)}
                  className="flex items-center gap-2.5 cursor-pointer group text-left flex-1 min-w-0"
                >
                  <FilterCheckbox checked={checked} />
                  <span className="text-sm text-[hsl(180,5%,65%)] group-hover:text-[hsl(180,5%,90%)] transition-colors flex-1 truncate">
                    {source.label}
                  </span>
                  <span className="text-xs text-[hsl(180,5%,35%)]">{count}</span>
                </button>
                {onRemoveSource && (
                  <button
                    type="button"
                    onClick={() => onRemoveSource(source.id)}
                    className="p-1 text-[hsl(180,5%,30%)] hover:text-red-400 transition-colors shrink-0"
                    title="Remove source"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]">
        <div className="text-xs font-medium text-[hsl(180,5%,45%)] uppercase tracking-wider">Type</div>
        <div className="flex flex-col gap-2">
          {TYPES.map((type) => {
            const count = typeCounts[type];
            const checked = selectedTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onTypeToggle(type)}
                className="flex items-center gap-2.5 cursor-pointer group text-left"
              >
                <FilterCheckbox checked={checked} />
                <span className="text-sm text-[hsl(180,5%,65%)] group-hover:text-[hsl(180,5%,90%)] transition-colors flex-1 capitalize">
                  {type}s
                </span>
                <span className="text-xs text-[hsl(180,5%,35%)]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]">
        <div className="text-xs font-medium text-[hsl(180,5%,45%)] uppercase tracking-wider">Category</div>
        <div className="flex flex-col gap-2">
          {categories.slice(0, 10).map(({ name, count }) => {
            const checked = selectedCategories.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onCategoryToggle(name)}
                className="flex items-center gap-2.5 cursor-pointer group text-left"
              >
                <FilterCheckbox checked={checked} />
                <span className="text-sm text-[hsl(180,5%,65%)] group-hover:text-[hsl(180,5%,90%)] transition-colors flex-1">
                  {name}
                </span>
                <span className="text-xs text-[hsl(180,5%,35%)]">{count}</span>
              </button>
            );
          })}
          {categories.length > 10 && (
            <div className="text-xs text-[hsl(180,5%,40%)] pl-6">
              +{categories.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* Compatibility */}
      <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]">
        <div className="text-xs font-medium text-[hsl(180,5%,45%)] uppercase tracking-wider">
          Compatibility
        </div>
        <div className="flex flex-col gap-2">
          {(['cloud-ready', 'relay-required'] as const).map((c) => {
            const labels = {
              'cloud-ready': 'Cloud Ready',
              'relay-required': 'Relay Required',
            };
            const checked = selectedCompatibility === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() =>
                  onCompatibilityChange(checked ? 'all' : c)
                }
                className="flex items-center gap-2.5 cursor-pointer group text-left"
              >
                <FilterCheckbox checked={checked} />
                <span className="text-sm text-[hsl(180,5%,65%)] group-hover:text-[hsl(180,5%,90%)] transition-colors flex-1">
                  {labels[c]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
