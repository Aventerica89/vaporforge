import { useMemo } from 'react';
import { Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ComponentInfo {
  component: string;
  file: string;
}

interface Props {
  components: ComponentInfo[];
  selectedComponent: string | null;
  onSelect: (comp: ComponentInfo) => void;
}

/** Group components by category extracted from file path */
function groupByCategory(components: ComponentInfo[]) {
  const groups: Record<string, ComponentInfo[]> = {};
  for (const comp of components) {
    // Extract category from path like "src/components/heroes/HeroCentered.astro"
    const parts = comp.file.split('/');
    const category =
      parts.length >= 3 ? parts[parts.length - 2] : 'uncategorized';
    if (!groups[category]) groups[category] = [];
    groups[category].push(comp);
  }
  return groups;
}

export function ComponentTree({
  components,
  selectedComponent,
  onSelect,
}: Props) {
  const groups = useMemo(() => groupByCategory(components), [components]);
  const categoryNames = useMemo(
    () => Object.keys(groups).sort(),
    [groups],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
      <div className="flex h-10 items-center gap-2 border-b border-zinc-700 px-3">
        <Layers className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Components
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">
          {components.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {components.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
            Loading component tree...
          </div>
        ) : (
          categoryNames.map((cat) => (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
              >
                {collapsed[cat] ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {cat}
              </button>

              {!collapsed[cat] &&
                groups[cat].map((comp) => (
                  <button
                    key={comp.file}
                    onClick={() => onSelect(comp)}
                    className={`flex w-full items-center px-5 py-1 text-left text-[11px] transition-colors ${
                      selectedComponent === comp.component
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {comp.component}
                  </button>
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
