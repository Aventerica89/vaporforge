import { useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  Search,
  Square,
  Crown,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowUp,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import { useCodeAnalysis } from '@/hooks/useCodeAnalysis';
import { useQuickChat } from '@/hooks/useQuickChat';

type ProviderName = 'claude' | 'gemini';

export function CodeAnalysisPanel() {
  const {
    isOpen,
    language,
    filePath,
    isStreaming,
    analysis,
    error,
    provider,
    setProvider,
    executeAnalysis,
    closeAnalysis,
    stopStream,
  } = useCodeAnalysis();

  const availableProviders = useQuickChat((s) => s.availableProviders);

  // Auto-execute on open
  useEffect(() => {
    if (isOpen && !analysis && !isStreaming && !error) {
      executeAnalysis();
    }
  }, [isOpen]);

  // Cmd+Shift+A shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        if (isOpen) closeAnalysis();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeAnalysis]);

  const handleRerun = useCallback(() => {
    if (!isStreaming) executeAnalysis();
  }, [isStreaming, executeAnalysis]);

  if (!isOpen) return null;

  const fileName = filePath?.split('/').pop() || 'selection';
  const complexityScore = analysis?.complexity?.score;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
      onClick={closeAnalysis}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="glass-card relative w-full max-w-3xl p-4 sm:p-6 space-y-4 animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-primary">
              Code Analysis
            </h2>
            <span className="text-xs text-muted-foreground font-mono">
              {fileName} ({language})
            </span>
          </div>
          <button
            onClick={closeAnalysis}
            className="rounded p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider toggle */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <ProviderToggle
            provider="claude"
            selected={provider === 'claude'}
            available={
              availableProviders.length === 0 ||
              availableProviders.includes('claude')
            }
            onClick={() => setProvider('claude')}
            icon={<Crown className="h-3.5 w-3.5" />}
            label="Claude"
          />
          <ProviderToggle
            provider="gemini"
            selected={provider === 'gemini'}
            available={
              availableProviders.length === 0 ||
              availableProviders.includes('gemini')
            }
            onClick={() => setProvider('gemini')}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Gemini"
          />
          <div className="flex-1" />
          {isStreaming ? (
            <button
              onClick={stopStream}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRerun}
              className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
            >
              <Search className="h-3 w-3" />
              Re-analyze
            </button>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Summary */}
          {analysis?.summary && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm text-foreground">{analysis.summary}</p>
            </div>
          )}

          {/* Complexity meter */}
          {complexityScore != null && (
            <ComplexityMeter
              score={complexityScore}
              label={analysis?.complexity?.label}
              reasoning={analysis?.complexity?.reasoning}
            />
          )}

          {/* Issues */}
          {analysis?.issues && analysis.issues.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Issues ({analysis.issues.length})
              </h3>
              <div className="space-y-1.5">
                {analysis.issues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <SeverityIcon severity={issue.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        {issue.message}
                      </p>
                      {issue.line != null && (
                        <span className="text-xs text-muted-foreground font-mono">
                          Line {issue.line}
                        </span>
                      )}
                    </div>
                    <SeverityBadge severity={issue.severity} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {analysis?.suggestions && analysis.suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Suggestions ({analysis.suggestions.length})
              </h3>
              <div className="space-y-1.5">
                {analysis.suggestions.map((sug, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <PriorityPill priority={sug.priority} />
                      <span className="text-sm font-medium text-foreground">
                        {sug.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {sug.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Streaming placeholder */}
          {isStreaming && !analysis?.summary && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Analyzing code...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Streaming indicator */}
        {isStreaming && analysis?.summary && (
          <div className="flex-shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Still analyzing...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex-shrink-0 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

function ComplexityMeter({
  score,
  label,
  reasoning,
}: {
  score: number;
  label?: string;
  reasoning?: string;
}) {
  const pct = (score / 10) * 100;
  const color =
    score <= 3
      ? 'bg-green-500'
      : score <= 6
        ? 'bg-yellow-500'
        : score <= 8
          ? 'bg-orange-500'
          : 'bg-red-500';

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Complexity
        </span>
        <span className="text-sm font-mono font-bold text-foreground">
          {score}/10
          {label && (
            <span className="ml-2 text-xs text-muted-foreground capitalize">
              ({label})
            </span>
          )}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {reasoning && (
        <p className="text-xs text-muted-foreground">{reasoning}</p>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'error')
    return <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />;
  if (severity === 'warning')
    return (
      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
    );
  return <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    error: 'bg-red-500/10 text-red-400 border-red-500/30',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${styles[severity] || styles.info}`}
    >
      {severity}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const icons: Record<string, React.ReactNode> = {
    high: <ArrowUp className="h-3 w-3" />,
    medium: <ArrowRight className="h-3 w-3" />,
    low: <ArrowDown className="h-3 w-3" />,
  };
  const styles: Record<string, string> = {
    high: 'bg-red-500/10 text-red-400',
    medium: 'bg-yellow-500/10 text-yellow-400',
    low: 'bg-blue-500/10 text-blue-400',
  };
  return (
    <span
      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[priority] || styles.low}`}
    >
      {icons[priority]}
      {priority}
    </span>
  );
}

function ProviderToggle({
  selected,
  available,
  onClick,
  icon,
  label,
}: {
  provider: ProviderName;
  selected: boolean;
  available: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      title={available ? label : `${label} — no API key configured`}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
        !available
          ? 'text-muted-foreground/40 border border-transparent cursor-not-allowed'
          : selected
            ? 'bg-primary/10 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
      }`}
    >
      {icon}
      {label}
      {!available && <span className="text-[9px] opacity-60">n/a</span>}
    </button>
  );
}
