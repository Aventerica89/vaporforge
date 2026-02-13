import { useState, useRef, useEffect } from 'react';
import { Trash2, Download, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useDebugLog, type DebugEntry } from '@/hooks/useDebugLog';

const CATEGORY_COLORS: Record<DebugEntry['category'], string> = {
  api: 'bg-blue-500/20 text-blue-400',
  stream: 'bg-purple-500/20 text-purple-400',
  sandbox: 'bg-cyan-500/20 text-cyan-400',
  error: 'bg-red-500/20 text-red-400',
  info: 'bg-zinc-500/20 text-zinc-400',
};

const LEVEL_COLORS: Record<DebugEntry['level'], string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-muted-foreground',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface ConsoleLogViewerProps {
  compact?: boolean; // true = floating mini panel mode
}

export function ConsoleLogViewer({ compact = false }: ConsoleLogViewerProps) {
  const { entries, clearEntries } = useDebugLog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filterText, setFilterText] = useState('');
  const [filterLevel, setFilterLevel] = useState<DebugEntry['level'] | 'all'>('all');

  // Auto-scroll on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const filtered = entries.filter((e) => {
    if (filterLevel !== 'all' && e.level !== filterLevel) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      return (
        e.summary.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaporforge-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className={`flex shrink-0 flex-wrap items-center gap-2 border-b border-border ${compact ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4'}`}>
        {/* Search */}
        <div className="relative flex-1 min-w-[120px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs..."
            className={`w-full rounded border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none ${compact ? 'h-7' : 'h-8'}`}
          />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(['all', 'error', 'warn', 'info'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`rounded px-2 py-1 text-[10px] font-medium uppercase transition-colors ${
                filterLevel === lvl
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {!compact && (
            <button
              onClick={handleExport}
              className="flex items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Export logs as JSON"
              style={{ minWidth: 'var(--touch-target, 36px)', minHeight: 'var(--touch-target, 36px)' }}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={clearEntries}
            className="flex items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Clear all entries"
            style={{ minWidth: 'var(--touch-target, 36px)', minHeight: 'var(--touch-target, 36px)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="text-[10px] font-mono text-muted-foreground/50 hidden sm:block">
          {filtered.length}/{entries.length}
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto ${compact ? 'max-h-[60vh] min-h-[200px]' : ''}`}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
      >
        {filtered.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/50">
            {entries.length === 0 ? 'No log entries yet' : 'No entries match filter'}
          </div>
        ) : (
          filtered.map((entry) => (
            <LogEntryRow key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: DebugEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30 text-xs">
      <button
        onClick={() => entry.detail && setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
        style={{
          minHeight: 'var(--touch-target, 44px)',
          padding: '8px 12px',
        }}
        disabled={!entry.detail}
        aria-expanded={entry.detail ? expanded : undefined}
      >
        {entry.detail ? (
          expanded ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0" />
        )}

        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
          {formatTime(entry.timestamp)}
        </span>

        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
            CATEGORY_COLORS[entry.category]
          }`}
        >
          {entry.category}
        </span>

        <span className={`truncate text-[11px] ${LEVEL_COLORS[entry.level]}`}>
          {entry.summary}
        </span>
      </button>

      {expanded && entry.detail && (
        <pre
          className="ml-5 mr-3 mb-2 overflow-x-auto rounded bg-muted/30 p-3 text-[11px] text-muted-foreground whitespace-pre-wrap break-all"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {entry.detail}
        </pre>
      )}
    </div>
  );
}
