import { useState, useMemo, useCallback } from 'react';
import { Search, Copy, Check, Code2, ChevronDown, ChevronRight } from 'lucide-react';
import { componentCatalog, componentCategories } from '@/lib/generated/component-catalog';
import { usePlayground } from '@/hooks/usePlayground';
import type { ComponentEntry } from '@/lib/generated/component-catalog';
import { toast } from '@/hooks/useToast';

export function ComponentsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { insertCode } = usePlayground();

  const filtered = useMemo(() => {
    let items = componentCatalog;
    if (activeCategory) {
      items = items.filter((c) => c.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [searchQuery, activeCategory]);

  const handleCopy = useCallback(
    (entry: ComponentEntry) => {
      navigator.clipboard.writeText(entry.code).catch(() => {});
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(`Copied ${entry.name} to clipboard`);
    },
    []
  );

  const handleInsert = useCallback(
    (entry: ComponentEntry) => {
      insertCode(entry.code);
      toast.success(`Inserted ${entry.name} into active panel`);
    },
    [insertCode]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Search + category filter */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-center sm:px-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search components..."
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
              !activeCategory
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            All
          </button>
          {componentCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
                activeCategory === cat
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Component list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 sm:px-4"
        style={{ overscrollBehavior: 'contain' }}
      >
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center py-12">
            <Code2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No components match your search.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <ComponentCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                copied={copiedId === entry.id}
                onToggle={() =>
                  setExpandedId(expandedId === entry.id ? null : entry.id)
                }
                onCopy={() => handleCopy(entry)}
                onInsert={() => handleInsert(entry)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComponentCard({
  entry,
  expanded,
  copied,
  onToggle,
  onCopy,
  onInsert,
}: {
  entry: ComponentEntry;
  expanded: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onInsert: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50 sm:px-4"
        style={{ minHeight: 'var(--touch-target, 44px)' }}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{entry.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {entry.category}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.description}
          </p>
        </div>

        {/* Actions (stop propagation so they don't toggle the card) */}
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onCopy}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:h-7 sm:w-7"
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onInsert}
            className="hidden rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors sm:block"
          >
            Use
          </button>
        </div>
      </button>

      {/* Code preview */}
      {expanded && (
        <div className="border-t border-border bg-muted/20">
          <pre
            className="overflow-x-auto p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all sm:p-4"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {entry.code}
          </pre>
          {/* Mobile-only insert button */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2 sm:hidden">
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onInsert}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Use in Panel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
