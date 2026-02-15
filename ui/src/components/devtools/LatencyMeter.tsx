import { useStreamDebug } from '@/hooks/useStreamDebug';

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function MeterBar({
  label,
  value,
  maxValue,
  formatted,
  colorClass,
}: {
  label: string;
  value: number | null;
  maxValue: number;
  formatted: string;
  colorClass: string;
}) {
  const pct = value != null ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground/70">{label}</span>
        <span className="text-[10px] tabular-nums font-mono text-foreground">
          {value != null ? formatted : '--'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/20">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LatencyMeter() {
  const metrics = useStreamDebug((s) => s.metrics);

  const ttft = metrics.ttft;
  const duration = metrics.duration;
  const tps = metrics.tokensPerSec;

  return (
    <div className="flex h-64 flex-col">
      <div className="flex-1 space-y-4 p-3">
        <MeterBar
          label="Time to First Token (TTFT)"
          value={ttft}
          maxValue={5000}
          formatted={ttft != null ? formatMs(ttft) : '--'}
          colorClass="bg-gradient-to-r from-primary/60 to-primary"
        />

        <MeterBar
          label="Stream Duration"
          value={duration}
          maxValue={30000}
          formatted={duration != null ? formatMs(duration) : '--'}
          colorClass="bg-gradient-to-r from-secondary/60 to-secondary"
        />

        <MeterBar
          label="Tokens per Second"
          value={tps}
          maxValue={100}
          formatted={tps != null ? `~${tps} tok/s` : '--'}
          colorClass="bg-gradient-to-r from-success/60 to-success"
        />

        {/* Summary stats */}
        <div className="flex gap-4 rounded-lg bg-muted/10 px-3 py-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground/60">Output tokens</span>
            <span className="text-xs font-mono font-semibold text-foreground">
              ~{metrics.estimatedOutputTokens}
            </span>
          </div>
          {ttft != null && duration != null && (
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground/60">
                TTFT / Duration
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {((ttft / duration) * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {!ttft && !duration && (
        <div className="flex flex-1 items-center justify-center text-[10px] text-muted-foreground/40">
          Send a message to see latency metrics
        </div>
      )}
    </div>
  );
}
