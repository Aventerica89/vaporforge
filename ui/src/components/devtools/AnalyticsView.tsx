import { useMemo } from 'react';
import { useDebugLog } from '@/hooks/useDebugLog';
import { useStreamDebug } from '@/hooks/useStreamDebug';
import { mean, errorRate } from '@/lib/stats';

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-border/30 bg-muted/5 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color || 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score > 90) return 'text-emerald-400';
  if (score > 70) return 'text-yellow-400';
  return 'text-red-400';
}

export function AnalyticsView() {
  const entries = useDebugLog((s) => s.entries);
  const metrics = useStreamDebug((s) => s.metrics);

  const stats = useMemo(() => {
    const errRate = errorRate(entries);
    const warnRate = entries.length > 0
      ? (entries.filter((e) => e.level === 'warn').length / entries.length) * 100
      : 0;

    // Compute average interval between consecutive entries
    const deltas: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].timestamp).getTime();
      const curr = new Date(entries[i].timestamp).getTime();
      const delta = curr - prev;
      if (delta >= 0) deltas.push(delta);
    }
    const avgInterval = mean(deltas);

    const perfScore = Math.max(0, 100 - errRate);

    return { errRate, warnRate, avgInterval, perfScore };
  }, [entries]);

  return (
    <div className="flex h-64 flex-col overflow-y-auto">
      {/* Performance score */}
      <div className="flex items-center justify-center border-b border-border/40 py-3">
        <div className="text-center">
          <div className={`text-3xl font-bold tabular-nums ${scoreColor(stats.perfScore)}`}>
            {stats.perfScore.toFixed(0)}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
            Performance Score
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-1.5 p-2">
        <StatCard label="Total Events" value={String(entries.length)} />
        <StatCard
          label="Error Rate"
          value={`${stats.errRate.toFixed(1)}%`}
          color={stats.errRate > 10 ? 'text-red-400' : undefined}
        />
        <StatCard
          label="Warning Rate"
          value={`${stats.warnRate.toFixed(1)}%`}
          color={stats.warnRate > 20 ? 'text-yellow-400' : undefined}
        />
        <StatCard
          label="Avg Interval"
          value={stats.avgInterval !== null ? `${Math.round(stats.avgInterval)}ms` : '—'}
        />
      </div>

      {/* Streaming metrics */}
      <div className="border-t border-border/40 px-2 py-1.5">
        <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground/50">
          Current Stream
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <StatCard
            label="TTFT"
            value={metrics.ttft !== null ? `${metrics.ttft}ms` : '—'}
          />
          <StatCard
            label="Duration"
            value={metrics.duration !== null ? `${(metrics.duration / 1000).toFixed(1)}s` : '—'}
          />
          <StatCard
            label="Tokens/sec"
            value={metrics.tokensPerSec !== null ? String(metrics.tokensPerSec) : '—'}
          />
        </div>
      </div>
    </div>
  );
}
