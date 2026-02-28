import { useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  X,
  Loader2,
  Check,
  XCircle,
  Wand2,
  Square,
  Crown,
  Sparkles,
  Bot,
} from 'lucide-react';
import { useCodeTransform } from '@/hooks/useCodeTransform';
import { useQuickChat } from '@/hooks/useQuickChat';

const MonacoDiffEditor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({
    default: mod.DiffEditor,
  }))
);

type ProviderName = 'claude' | 'gemini';

export function CodeTransformPanel() {
  const {
    isOpen,
    selectedCode,
    language,
    filePath,
    instruction,
    transformedCode,
    isStreaming,
    error,
    provider,
    setInstruction,
    setProvider,
    executeTransform,
    acceptTransform,
    rejectTransform,
    stopStream,
  } = useCodeTransform();

  const availableProviders = useQuickChat((s) => s.availableProviders);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Cmd+Shift+T shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 't') {
        e.preventDefault();
        if (isOpen) {
          rejectTransform();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, rejectTransform]);

  const handleExecute = useCallback(() => {
    if (!instruction.trim() || isStreaming) return;
    executeTransform();
  }, [instruction, isStreaming, executeTransform]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute]
  );

  const handleAccept = useCallback(() => {
    acceptTransform();
  }, [acceptTransform]);

  if (!isOpen) return null;

  const fileName = filePath?.split('/').pop() || 'untitled';
  const hasResult = transformedCode.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
      onClick={rejectTransform}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="glass-card relative w-full max-w-4xl p-4 sm:p-6 space-y-4 animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-primary">
              Code Transform
            </h2>
            <span className="text-xs text-muted-foreground font-mono">
              {fileName}
            </span>
          </div>
          <button
            onClick={rejectTransform}
            className="rounded p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider toggle + instruction */}
        <div className="flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <ProviderToggle
              provider="claude"
              selected={provider === 'claude'}
              available={availableProviders.length === 0 || availableProviders.includes('claude')}
              onClick={() => setProvider('claude')}
              icon={<Crown className="h-3.5 w-3.5" />}
              label="Claude"
            />
            <ProviderToggle
              provider="gemini"
              selected={provider === 'gemini'}
              available={availableProviders.length === 0 || availableProviders.includes('gemini')}
              onClick={() => setProvider('gemini')}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Gemini"
            />
            <ProviderToggle
              provider="openai"
              selected={provider === 'openai'}
              available={availableProviders.length === 0 || availableProviders.includes('openai')}
              onClick={() => setProvider('openai')}
              icon={<Bot className="h-3.5 w-3.5" />}
              label="OpenAI"
            />
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the transformation (e.g. 'Convert to async/await', 'Add error handling')"
              rows={2}
              className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            {isStreaming ? (
              <button
                onClick={stopStream}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                title="Stop"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleExecute}
                disabled={!instruction.trim()}
                className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors"
                title="Transform (Cmd+Enter)"
              >
                <Wand2 className="h-4 w-4" />
                Transform
              </button>
            )}
          </div>
        </div>

        {/* Diff editor area */}
        <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-[#1e1e1e]">
          {hasResult || isStreaming ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              <MonacoDiffEditor
                height="100%"
                language={language}
                original={selectedCode}
                modified={transformedCode}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', Menlo, monospace",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  renderSideBySide: true,
                  originalEditable: false,
                }}
              />
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <Wand2 className="h-10 w-10 mx-auto opacity-20" />
                <p className="text-sm">
                  Describe your transformation and click Transform
                </p>
                <p className="text-xs text-muted-foreground/60">
                  The diff view will appear here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex-shrink-0 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex-shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Transforming code...</span>
          </div>
        )}

        {/* Footer actions */}
        {hasResult && !isStreaming && (
          <div className="flex-shrink-0 flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              onClick={rejectTransform}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={handleAccept}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
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
