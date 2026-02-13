import { create } from 'zustand';
import { X, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import type { TestSummary, TestResult } from '@/lib/parsers/test-results-parser';

/* ── Store ──────────────────────────────────── */

interface TestResultsState {
  results: TestSummary | null;
  isOpen: boolean;
  showResults: (results: TestSummary) => void;
  dismiss: () => void;
}

export const useTestResults = create<TestResultsState>((set) => ({
  results: null,
  isOpen: false,
  showResults: (results) => set({ results, isOpen: true }),
  dismiss: () => set({ isOpen: false }),
}));

/* ── Component ──────────────────────────────── */

export function TestResultsOverlay() {
  const { results, isOpen, dismiss } = useTestResults();

  if (!isOpen || !results) return null;

  const { total, passed, failed, skipped, duration, framework } = results;
  const allPassed = failed === 0;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
      onClick={dismiss}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="glass-card relative w-full max-w-md p-4 sm:p-6 space-y-4 animate-scale-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {allPassed ? (
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-foreground">
              Test Results
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
              {framework}
            </span>
          </div>
          <button
            onClick={dismiss}
            className="rounded p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex-shrink-0 space-y-2">
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
            {passed > 0 && (
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(passed / total) * 100}%` }}
              />
            )}
            {failed > 0 && (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(failed / total) * 100}%` }}
              />
            )}
            {skipped > 0 && (
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${(skipped / total) * 100}%` }}
              />
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs">
            <Stat
              icon={<CheckCircle2 className="h-3 w-3 text-green-400" />}
              label="Passed"
              value={passed}
            />
            <Stat
              icon={<XCircle className="h-3 w-3 text-red-400" />}
              label="Failed"
              value={failed}
            />
            <Stat
              icon={<MinusCircle className="h-3 w-3 text-yellow-400" />}
              label="Skipped"
              value={skipped}
            />
            <div className="flex-1" />
            <span className="text-muted-foreground font-mono">
              {passRate}%
            </span>
            {duration != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {duration.toFixed(2)}s
              </span>
            )}
          </div>
        </div>

        {/* Individual results */}
        {results.results.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {results.results.map((r, i) => (
              <ResultRow key={i} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

function ResultRow({ result }: { result: TestResult }) {
  const icons: Record<string, React.ReactNode> = {
    pass: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
    fail: <XCircle className="h-3.5 w-3.5 text-red-400" />,
    skip: <MinusCircle className="h-3.5 w-3.5 text-yellow-400" />,
  };

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/30 transition-colors">
      {icons[result.status]}
      <span className="text-xs text-foreground truncate flex-1 font-mono">
        {result.name}
      </span>
      {result.duration != null && (
        <span className="text-[10px] text-muted-foreground">
          {result.duration}ms
        </span>
      )}
    </div>
  );
}
