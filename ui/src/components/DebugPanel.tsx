import { useEffect, useState, useCallback, useMemo } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Bug, X, Copy, Check, Download, Star } from 'lucide-react';
import { useDebugLog, type DebugCategory } from '@/hooks/useDebugLog';
import { WikiTab } from '@/components/WikiTab';
import { StreamDebugger } from '@/components/devtools/StreamDebugger';
import { TokenViewer } from '@/components/devtools/TokenViewer';
import { LatencyMeter } from '@/components/devtools/LatencyMeter';
import { TimelineView } from '@/components/devtools/TimelineView';
import { AnalyticsView } from '@/components/devtools/AnalyticsView';

type Tab = 'log' | 'timeline' | 'stats' | 'stream' | 'tokens' | 'latency' | 'wiki';

const TAB_LABELS: Record<Tab, string> = {
  log: 'Log',
  timeline: 'Time',
  stats: 'Stats',
  stream: 'Stream',
  tokens: 'Tokens',
  latency: 'Latency',
  wiki: 'Wiki',
};

const ALL_CATEGORIES: DebugCategory[] = ['api', 'stream', 'sandbox', 'error', 'info', 'mcp', 'auth', 'system'];

function formatEntriesForClipboard(): string {
  const { entries } = useDebugLog.getState();
  if (entries.length === 0) return 'No log entries.';
  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const line = `[${time}] ${e.level.toUpperCase()} [${e.category}] ${e.summary}`;
      return e.detail ? `${line}\n  ${e.detail}` : line;
    })
    .join('\n');
}

function handleExport() {
  const json = useDebugLog.getState().exportEntries();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vaporforge-debug-log.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function DebugPanel() {
  const { unreadErrors, isOpen, toggle, close } = useDebugLog();
  const entries = useDebugLog((s) => s.entries);
  const searchQuery = useDebugLog((s) => s.searchQuery);
  const setSearchQuery = useDebugLog((s) => s.setSearchQuery);
  const categoryFilter = useDebugLog((s) => s.categoryFilter);
  const setCategoryFilter = useDebugLog((s) => s.setCategoryFilter);
  const bookmarkedIds = useDebugLog((s) => s.bookmarkedIds);
  const toggleBookmark = useDebugLog((s) => s.toggleBookmark);
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(async () => {
    const text = formatEntriesForClipboard();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // H7 HIG fix: Focus trap keeps keyboard navigation inside the panel.
  const panelRef = useFocusTrap(isOpen, close) as React.RefObject<HTMLDivElement>;

  // Check localStorage flag on mount + listen for storage events
  useEffect(() => {
    const check = () =>
      setVisible(localStorage.getItem('vf_debug') === '1');
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  // Filtered entries for log tab
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (categoryFilter && categoryFilter.size > 0) {
      result = result.filter((e) => categoryFilter.has(e.category));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          (e.detail && e.detail.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [entries, categoryFilter, searchQuery]);

  // Active categories (only show pills for categories that have entries)
  const activeCategories = useMemo(() => {
    const cats = new Set<DebugCategory>();
    for (const e of entries) cats.add(e.category);
    return ALL_CATEGORIES.filter((c) => cats.has(c));
  }, [entries]);

  const toggleCategory = useCallback(
    (cat: DebugCategory) => {
      const current = categoryFilter || new Set<DebugCategory>();
      const next = new Set(current);
      if (next.has(cat)) {
        next.delete(cat);
        setCategoryFilter(next.size === 0 ? null : next);
      } else {
        next.add(cat);
        setCategoryFilter(next);
      }
    },
    [categoryFilter, setCategoryFilter],
  );

  if (!visible) return null;

  return (
    <>
      {/* Floating debug button */}
      <button
        onClick={toggle}
        className="fixed z-50 flex items-center justify-center rounded-full bg-card border border-border shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 1rem)',
          right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
          minWidth: 'var(--touch-target)',
          minHeight: 'var(--touch-target)',
          width: 'var(--touch-target)',
          height: 'var(--touch-target)',
        }}
        aria-label="Toggle debug panel" title="Toggle debug panel"
      >
        <Bug className="h-5 w-5 text-muted-foreground" />
        {unreadErrors > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadErrors > 99 ? '99+' : unreadErrors}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 5rem, 5rem)',
            right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
            width: 'min(420px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 7rem)',
          }}
          role="dialog"
          aria-label="Debug panel" title="Debug panel"
        >
          {/* Header with tabs */}
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    tab === t
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {TAB_LABELS[t]}
                  {t === 'log' && unreadErrors > 0 && (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadErrors > 99 ? '99+' : unreadErrors}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              {tab === 'log' && (
                <>
                  <button
                    onClick={handleExport}
                    className="flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
                    style={{
                      minWidth: 'var(--touch-target)',
                      minHeight: 'var(--touch-target)',
                    }}
                    aria-label="Export log as JSON"
                    title="Export log as JSON"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
                    style={{
                      minWidth: 'var(--touch-target)',
                      minHeight: 'var(--touch-target)',
                    }}
                    aria-label="Copy all log entries"
                    title="Copy all log entries"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </>
              )}
              <button
                onClick={close}
                className="flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
                style={{
                  minWidth: 'var(--touch-target)',
                  minHeight: 'var(--touch-target)',
                }}
                aria-label="Close debug panel" title="Close debug panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tab content */}
          {tab === 'log' && (
            <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
              {/* Search + category filter */}
              <div className="border-b border-border/40 px-2 py-1.5 space-y-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1.5 py-0.5"
                />
                {activeCategories.length > 1 && (
                  <div className="flex flex-wrap gap-0.5">
                    {activeCategories.map((cat) => {
                      const isActive = categoryFilter ? categoryFilter.has(cat) : false;
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase transition-colors ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground/50 hover:text-muted-foreground'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Filtered log entries */}
              <div className="flex-1 overflow-y-auto p-2 text-xs font-mono space-y-0.5">
                {filteredEntries.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-[10px] text-muted-foreground/40">
                    {entries.length === 0 ? 'No log entries yet' : 'No entries match filter'}
                  </div>
                ) : (
                  filteredEntries.map((e) => {
                    const isBookmarked = bookmarkedIds.has(e.id);
                    return (
                      <div
                        key={e.id}
                        className={`group flex items-start gap-1 rounded px-2 py-1 ${
                          isBookmarked ? 'border-l-2 border-primary' : ''
                        } ${
                          e.level === 'error'
                            ? 'bg-red-500/10 text-red-400'
                            : e.level === 'warn'
                            ? 'bg-yellow-500/10 text-yellow-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="opacity-50">
                            [{new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false })}]
                          </span>{' '}
                          <span className="font-semibold">[{e.category}]</span> {e.summary}
                          {e.detail && (
                            <div className="mt-0.5 text-[10px] opacity-50 truncate">{e.detail}</div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleBookmark(e.id)}
                          className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isBookmarked ? 'opacity-100 text-primary' : 'text-muted-foreground/30'
                          }`}
                          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark entry'}
                        >
                          <Star className={`h-3 w-3 ${isBookmarked ? 'fill-primary' : ''}`} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {tab === 'timeline' && <TimelineView />}
          {tab === 'stats' && <AnalyticsView />}
          {tab === 'stream' && <StreamDebugger />}
          {tab === 'tokens' && <TokenViewer />}
          {tab === 'latency' && <LatencyMeter />}
          {tab === 'wiki' && <WikiTab />}
        </div>
      )}
    </>
  );
}
