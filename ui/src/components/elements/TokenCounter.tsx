import { cn } from '@/lib/cn';

export type TokenCounterProps = {
  tokens: number;
  maxTokens?: number;
  className?: string;
};

// Rough model context windows
const DEFAULT_MAX = 200_000;

function pct(tokens: number, max: number) {
  return Math.min((tokens / max) * 100, 100);
}

export function TokenCounter({ tokens, maxTokens = DEFAULT_MAX, className }: TokenCounterProps) {
  const usage = pct(tokens, maxTokens);

  const barColor =
    usage >= 90
      ? 'bg-red-500'
      : usage >= 60
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  const textColor =
    usage >= 90
      ? 'text-red-400'
      : usage >= 60
        ? 'text-amber-400'
        : 'text-muted-foreground';

  function fmt(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)} title={`~${tokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`}>
      {/* Mini progress bar */}
      <div className="h-1 w-12 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${usage}%` }}
        />
      </div>

      {/* Count label */}
      <span className={cn('font-mono text-[10px] tabular-nums', textColor)}>
        {fmt(tokens)}
      </span>
    </div>
  );
}
