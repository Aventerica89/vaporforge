import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  GitCommitHorizontal,
  Hash,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { useDevChangelog } from '@/hooks/useDevChangelog';
import { BUILD_HASH, BUILD_DATE, COMMIT_LOG } from '@/lib/generated/build-info';

const FILTER_TYPES = ['all', 'feat', 'fix', 'ci', 'refactor', 'chore', 'docs', 'other'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

const TYPE_COLORS: Record<string, string> = {
  feat: 'bg-green-500/20 text-green-400 border-green-500/30',
  fix: 'bg-red-500/20 text-red-400 border-red-500/30',
  ci: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  refactor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  chore: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  docs: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  test: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  perf: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  other: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
};

function commitTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Extract scope from conventional commit: "feat(editor): ..." → "editor" */
function extractScope(message: string): string | null {
  const match = message.match(/^\w+\(([^)]+)\):/);
  return match ? match[1] : null;
}

/** Strip conventional commit prefix: "feat(editor): add thing" → "add thing" */
function stripPrefix(message: string): string {
  return message.replace(/^\w+(\([^)]+\))?:\s*/, '');
}

/** Group commits by date (YYYY-MM-DD) */
function groupByDate(
  commits: typeof COMMIT_LOG
): { date: string; label: string; commits: typeof COMMIT_LOG }[] {
  const groups = new Map<string, (typeof COMMIT_LOG)[number][]>();

  for (const commit of commits) {
    const d = new Date(commit.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(commit);
    } else {
      groups.set(key, [commit]);
    }
  }

  return Array.from(groups.entries()).map(([date, commits]) => {
    const d = new Date(date + 'T12:00:00');
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const label = isToday
      ? 'Today'
      : isYesterday
        ? 'Yesterday'
        : d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

    return { date, label, commits };
  });
}

export function DevChangelog() {
  const { isOpen, closeChangelog } = useDevChangelog();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHashes, setExpandedHashes] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChangelog();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, closeChangelog]);

  const toggleExpand = useCallback((hash: string) => {
    setExpandedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedHashes(new Set(COMMIT_LOG.map((c) => c.hash)));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedHashes(new Set());
  }, []);

  const handleCopyLog = useCallback(() => {
    const lines = filtered.map(
      (c) => `${c.hash} ${c.type}: ${stripPrefix(c.message)} (${c.date})`
    );
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Filter + search
  const query = searchQuery.toLowerCase().trim();
  const filtered = useMemo(() => {
    let result =
      filter === 'all'
        ? [...COMMIT_LOG]
        : COMMIT_LOG.filter((c) => c.type === filter);

    if (query) {
      result = result.filter(
        (c) =>
          c.message.toLowerCase().includes(query) ||
          c.hash.toLowerCase().includes(query)
      );
    }

    return result;
  }, [filter, query]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  // Type counts for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of COMMIT_LOG) {
      counts[c.type] = (counts[c.type] || 0) + 1;
    }
    return counts;
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 py-8"
      onClick={closeChangelog}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="glass-card relative flex w-full max-w-3xl flex-col animate-scale-in"
        style={{
          maxHeight: 'calc(100vh - 4rem)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <GitCommitHorizontal className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-amber-400">
              Dev Changelog
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {COMMIT_LOG.length} commits
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Build info */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {BUILD_HASH}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {BUILD_DATE}
              </span>
            </div>

            {/* Copy log */}
            <button
              onClick={handleCopyLog}
              className="flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5"
              title="Copy commit log"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-400 sm:h-3.5 sm:w-3.5" />
              ) : (
                <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              )}
              <span className="hidden sm:inline">
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </button>

            {/* Close */}
            <button
              onClick={closeChangelog}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors sm:h-8 sm:w-8"
              aria-label="Close"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs + search */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5 sm:py-2">
          <div className="flex flex-wrap gap-2 sm:gap-1">
            {FILTER_TYPES.map((t) => {
              const count = t === 'all' ? COMMIT_LOG.length : (typeCounts[t] || 0);
              if (t !== 'all' && count === 0) return null;
              return (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`min-h-[44px] rounded-md px-3 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-[11px] ${
                    filter === t
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Expand/collapse all */}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <button
              onClick={expandAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              title="Expand all"
            >
              Expand
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button
              onClick={collapseAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              title="Collapse all"
            >
              Collapse
            </button>
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-2 sm:h-3 sm:w-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commits..."
              className="min-h-[44px] w-44 rounded border border-border bg-muted pl-9 pr-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:min-h-0 sm:w-40 sm:pl-7 sm:pr-2 sm:py-1 sm:text-xs"
            />
          </div>
        </div>

        {/* Commit list — grouped by date */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 sm:px-5"
          style={{ overscrollBehavior: 'contain' }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground/60">
                No commits match this filter.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.date}>
                  {/* Date header */}
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </h3>
                    <span className="text-[10px] font-mono text-muted-foreground/40">
                      {group.date}
                    </span>
                    <div className="flex-1 border-b border-border/50" />
                    <span className="text-[10px] text-muted-foreground/40">
                      {group.commits.length}
                    </span>
                  </div>

                  {/* Commits in this date */}
                  <div className="space-y-1">
                    {group.commits.map((commit) => {
                      const isExpanded = expandedHashes.has(commit.hash);
                      const scope = extractScope(commit.message);
                      const cleanMessage = stripPrefix(commit.message);

                      return (
                        <div
                          key={commit.hash}
                          className={`rounded-lg border transition-colors ${
                            isExpanded
                              ? 'border-amber-500/20 bg-amber-500/5'
                              : 'border-transparent hover:bg-accent/50'
                          }`}
                        >
                          {/* Collapsed row */}
                          <button
                            onClick={() => toggleExpand(commit.hash)}
                            className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
                          >
                            {/* Expand chevron */}
                            {isExpanded ? (
                              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                            )}

                            {/* Type badge */}
                            <span
                              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border ${
                                TYPE_COLORS[commit.type] || TYPE_COLORS.other
                              }`}
                            >
                              {commit.type}
                            </span>

                            {/* Scope badge */}
                            {scope && (
                              <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                                {scope}
                              </span>
                            )}

                            {/* Message */}
                            <span
                              className={`flex-1 text-xs leading-relaxed min-w-0 ${
                                isExpanded
                                  ? 'text-foreground'
                                  : 'text-foreground truncate'
                              }`}
                            >
                              {cleanMessage}
                            </span>

                            {/* Time ago */}
                            <span className="shrink-0 text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                              {commitTimeAgo(commit.date)}
                            </span>
                          </button>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="border-t border-border/50 px-3 py-3 ml-6">
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                                <span className="text-muted-foreground">
                                  Hash
                                </span>
                                <span className="font-mono text-amber-400">
                                  {commit.hash}
                                </span>

                                <span className="text-muted-foreground">
                                  Full message
                                </span>
                                <span className="text-foreground">
                                  {commit.message}
                                </span>

                                <span className="text-muted-foreground">
                                  Date
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {new Date(commit.date).toLocaleString()}
                                </span>

                                <span className="text-muted-foreground">
                                  Type
                                </span>
                                <span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border ${
                                      TYPE_COLORS[commit.type] ||
                                      TYPE_COLORS.other
                                    }`}
                                  >
                                    {commit.type}
                                  </span>
                                </span>

                                {scope && (
                                  <>
                                    <span className="text-muted-foreground">
                                      Scope
                                    </span>
                                    <span className="font-mono text-muted-foreground">
                                      {scope}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t border-border px-4 py-2 sm:px-5"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
          }}
        >
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 font-mono">
            <span>
              {filtered.length} / {COMMIT_LOG.length} commits
            </span>
            <span>
              Built {BUILD_DATE} from #{BUILD_HASH}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
