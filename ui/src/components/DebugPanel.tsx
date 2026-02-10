import { useEffect, useRef, useState } from 'react';
import { Bug, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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

function EntryRow({ entry }: { entry: DebugEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30 px-3 py-1.5 text-xs">
      <button
        onClick={() => entry.detail && setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left"
      >
        {entry.detail ? (
          expanded ? (
            <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="mt-0.5 inline-block h-3 w-3 shrink-0" />
        )}

        <span className="shrink-0 font-mono text-muted-foreground/60">
          {formatTime(entry.timestamp)}
        </span>

        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
            CATEGORY_COLORS[entry.category]
          }`}
        >
          {entry.category}
        </span>

        <span className={`truncate ${LEVEL_COLORS[entry.level]}`}>
          {entry.summary}
        </span>
      </button>

      {expanded && entry.detail && (
        <pre className="mt-1 ml-5 overflow-x-auto rounded bg-muted/30 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export function DebugPanel() {
  const { entries, unreadErrors, isOpen, toggle, close, clearEntries } =
    useDebugLog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Check localStorage flag on mount + listen for storage events
  useEffect(() => {
    const check = () =>
      setVisible(localStorage.getItem('vf_debug') === '1');
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, isOpen]);

  if (!visible) return null;

  return (
    <>
      {/* Floating debug button */}
      <button
        onClick={toggle}
        className="fixed z-50 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 1rem)',
          right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
        }}
        title="Debug panel"
      >
        <Bug className="h-4 w-4 text-muted-foreground" />
        {unreadErrors > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadErrors > 99 ? '99+' : unreadErrors}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 4rem, 4rem)',
            right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Debug Log ({entries.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={clearEntries}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="Clear all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={close}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Entries */}
          <div
            ref={scrollRef}
            className="max-h-[60vh] min-h-[200px] overflow-y-auto"
          >
            {entries.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground/50">
                No debug entries yet
              </div>
            ) : (
              entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
