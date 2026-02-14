import { useState, useMemo } from 'react';
import { X, GitCommitHorizontal, Hash, Clock } from 'lucide-react';
import { BUILD_HASH, BUILD_TIMESTAMP, COMMIT_LOG } from '@/lib/generated/build-info';

const FILTER_TYPES = ['all', 'feat', 'fix', 'ci', 'refactor', 'chore'] as const;
type FilterType = typeof FILTER_TYPES[number];

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

export function DevChangelog({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? COMMIT_LOG
        : COMMIT_LOG.filter((c) => c.type === filter),
    [filter]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-amber-500/30 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Dev Changelog
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
              <Hash className="h-3 w-3" />
              <span>{BUILD_HASH}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
              <Clock className="h-3 w-3" />
              <span>{new Date(BUILD_TIMESTAMP).toLocaleString()}</span>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
          {FILTER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wide border transition-colors ${
                filter === t
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {t}
              {t !== 'all' && (
                <span className="ml-1 opacity-60">
                  {COMMIT_LOG.filter((c) => c.type === t).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Commit list */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No commits match this filter
            </p>
          ) : (
            filtered.map((commit) => (
              <div
                key={commit.hash}
                className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors group"
              >
                {/* Type badge */}
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border ${
                    TYPE_COLORS[commit.type] || TYPE_COLORS.other
                  }`}
                >
                  {commit.type}
                </span>

                {/* Hash */}
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 mt-0.5">
                  {commit.hash}
                </span>

                {/* Message */}
                <span className="flex-1 text-xs text-foreground leading-relaxed min-w-0 truncate">
                  {commit.message.replace(/^\w+(\(.*?\))?:\s*/, '')}
                </span>

                {/* Time */}
                <span className="shrink-0 text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                  {commitTimeAgo(commit.date)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground/50 text-center font-mono">
          {filtered.length} / {COMMIT_LOG.length} commits
        </div>
      </div>
    </div>
  );
}
