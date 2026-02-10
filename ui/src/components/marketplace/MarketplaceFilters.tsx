import { catalog, catalogStats } from '@/lib/generated/plugin-catalog';
import { useMemo } from 'react';

interface MarketplaceFiltersProps {
  selectedSource: 'all' | 'anthropic-official' | 'awesome-community';
  selectedCategories: string[];
  selectedTypes: string[];
  selectedCompatibility: 'all' | 'cloud-ready' | 'relay-required';
  onSourceChange: (source: 'all' | 'anthropic-official' | 'awesome-community') => void;
  onCategoryToggle: (category: string) => void;
  onTypeToggle: (type: string) => void;
  onCompatibilityChange: (c: 'all' | 'cloud-ready' | 'relay-required') => void;
  onClearAll: () => void;
}

const SOURCES = [
  { id: 'anthropic-official' as const, label: 'Anthropic Official' },
  { id: 'awesome-community' as const, label: 'Community' },
];

const TYPES = ['agent', 'skill', 'command', 'rule'] as const;

export function MarketplaceFilters({
  selectedSource,
  selectedCategories,
  selectedTypes,
  selectedCompatibility,
  onSourceChange,
  onCategoryToggle,
  onTypeToggle,
  onCompatibilityChange,
  onClearAll,
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
  }, []);

  const typeCounts = useMemo(() => {
    const counts = { agent: 0, skill: 0, command: 0, rule: 0 };
    for (const p of catalog) {
      if (p.agent_count > 0) counts.agent++;
      if (p.skill_count > 0) counts.skill++;
      if (p.command_count > 0) counts.command++;
      if (p.rule_count > 0) counts.rule++;
    }
    return counts;
  }, []);

  const hasActiveFilters =
    selectedSource !== 'all' ||
    selectedCategories.length > 0 ||
    selectedTypes.length > 0 ||
    selectedCompatibility !== 'all';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="text-xs text-violet-400 hover:text-violet-300"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Source */}
      <div className="flex flex-col gap-3">
        <div className="text-sm font-medium text-muted-foreground">Source</div>
        <div className="flex flex-col gap-2">
          {SOURCES.map((source) => {
            const count =
              source.id === 'anthropic-official'
                ? catalogStats.official
                : catalogStats.community;
            return (
              <label
                key={source.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selectedSource === source.id}
                  onChange={() => onSourceChange(selectedSource === source.id ? 'all' : source.id)}
                  className="w-4 h-4 rounded border-border text-violet-500 focus:ring-violet-500/50 cursor-pointer"
                />
                <span className="text-sm group-hover:text-foreground transition-colors flex-1">
                  {source.label}
                </span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <div className="flex flex-col gap-3 pt-3 border-t border-border">
        <div className="text-sm font-medium text-muted-foreground">Type</div>
        <div className="flex flex-col gap-2">
          {TYPES.map((type) => {
            const count = typeCounts[type];
            return (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => onTypeToggle(type)}
                  className="w-4 h-4 rounded border-border text-violet-500 focus:ring-violet-500/50 cursor-pointer"
                />
                <span className="text-sm group-hover:text-foreground transition-colors flex-1 capitalize">
                  {type}s
                </span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-3 pt-3 border-t border-border">
        <div className="text-sm font-medium text-muted-foreground">Category</div>
        <div className="flex flex-col gap-2">
          {categories.slice(0, 10).map(({ name, count }) => (
            <label
              key={name}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(name)}
                onChange={() => onCategoryToggle(name)}
                className="w-4 h-4 rounded border-border text-violet-500 focus:ring-violet-500/50 cursor-pointer"
              />
              <span className="text-sm group-hover:text-foreground transition-colors flex-1">
                {name}
              </span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </label>
          ))}
          {categories.length > 10 && (
            <div className="text-xs text-muted-foreground pl-6">
              +{categories.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* Compatibility */}
      <div className="flex flex-col gap-3 pt-3 border-t border-border">
        <div className="text-sm font-medium text-muted-foreground">
          Compatibility
        </div>
        <div className="flex flex-col gap-2">
          {(['cloud-ready', 'relay-required'] as const).map((c) => {
            const labels = {
              'cloud-ready': 'Cloud Ready',
              'relay-required': 'Relay Required',
            };
            return (
              <label
                key={c}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selectedCompatibility === c}
                  onChange={() =>
                    onCompatibilityChange(
                      selectedCompatibility === c ? 'all' : c
                    )
                  }
                  className="w-4 h-4 rounded border-border text-violet-500 focus:ring-violet-500/50 cursor-pointer"
                />
                <span className="text-sm group-hover:text-foreground transition-colors flex-1">
                  {labels[c]}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
