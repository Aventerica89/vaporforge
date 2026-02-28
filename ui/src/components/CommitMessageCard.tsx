import { useCallback } from 'react';
import {
  X,
  Loader2,
  GitCommitHorizontal,
  Crown,
  Sparkles,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { useCommitMessage } from '@/hooks/useCommitMessage';
import { useQuickChat } from '@/hooks/useQuickChat';

type ProviderName = 'claude' | 'gemini' | 'openai';

const COMMIT_TYPES: Array<{ value: string; label: string; color: string }> = [
  { value: 'feat', label: 'feat', color: 'bg-green-500/10 text-green-400' },
  { value: 'fix', label: 'fix', color: 'bg-red-500/10 text-red-400' },
  { value: 'refactor', label: 'refactor', color: 'bg-purple-500/10 text-purple-400' },
  { value: 'docs', label: 'docs', color: 'bg-blue-500/10 text-blue-400' },
  { value: 'test', label: 'test', color: 'bg-yellow-500/10 text-yellow-400' },
  { value: 'chore', label: 'chore', color: 'bg-gray-500/10 text-gray-400' },
  { value: 'perf', label: 'perf', color: 'bg-orange-500/10 text-orange-400' },
  { value: 'ci', label: 'ci', color: 'bg-cyan-500/10 text-cyan-400' },
  { value: 'style', label: 'style', color: 'bg-pink-500/10 text-pink-400' },
  { value: 'build', label: 'build', color: 'bg-amber-500/10 text-amber-400' },
];

export function CommitMessageCard() {
  const {
    isOpen,
    isGenerating,
    commitMessage,
    error,
    provider,
    editField,
    dismiss,
    setProvider,
    formatted,
  } = useCommitMessage();

  const availableProviders = useQuickChat((s) => s.availableProviders);

  const handleCopy = useCallback(() => {
    const msg = formatted();
    if (msg) {
      navigator.clipboard.writeText(msg);
    }
  }, [formatted]);

  if (!isOpen) return null;

  const typeColor =
    COMMIT_TYPES.find((t) => t.value === commitMessage?.type)?.color ||
    'bg-gray-500/10 text-gray-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
      onClick={dismiss}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="glass-card relative w-full max-w-lg p-4 sm:p-6 space-y-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitCommitHorizontal className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-primary">
              Commit Message
            </h2>
          </div>
          <button
            onClick={dismiss}
            className="rounded p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider toggle */}
        <div className="flex items-center gap-2">
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
          <ProviderToggle
            provider="openai"
            selected={provider === 'openai'}
            available={
              availableProviders.length === 0 ||
              availableProviders.includes('openai')
            }
            onClick={() => setProvider('openai')}
            icon={<Bot className="h-3.5 w-3.5" />}
            label="OpenAI"
          />
        </div>

        {/* Loading */}
        {isGenerating && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                Generating commit message...
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {commitMessage && !isGenerating && (
          <div className="space-y-3">
            {/* Type selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Type
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMIT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => editField('type', t.value)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      commitMessage.type === t.value
                        ? `${t.color} border border-current/30`
                        : 'text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Scope (optional)
              </label>
              <input
                value={commitMessage.scope || ''}
                onChange={(e) =>
                  editField('scope', e.target.value || undefined)
                }
                placeholder="e.g. auth, ui, api"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Subject
              </label>
              <input
                value={commitMessage.subject}
                onChange={(e) => editField('subject', e.target.value)}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Body (optional)
              </label>
              <textarea
                value={commitMessage.body || ''}
                onChange={(e) =>
                  editField('body', e.target.value || undefined)
                }
                rows={3}
                placeholder="Longer explanation if needed..."
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Breaking change toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={commitMessage.breaking}
                onChange={(e) => editField('breaking', e.target.checked)}
                className="rounded border-border accent-red-500"
              />
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs text-muted-foreground">
                Breaking change
              </span>
            </label>

            {/* Preview */}
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Preview
              </span>
              <p className="mt-1 text-sm font-mono text-foreground">
                <span className={`rounded px-1 py-0.5 ${typeColor}`}>
                  {commitMessage.type}
                </span>
                {commitMessage.scope && (
                  <span className="text-muted-foreground">
                    ({commitMessage.scope})
                  </span>
                )}
                {commitMessage.breaking && (
                  <span className="text-red-400">!</span>
                )}
                <span className="text-muted-foreground">: </span>
                {commitMessage.subject}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={dismiss}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <GitCommitHorizontal className="h-3 w-3" />
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

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
