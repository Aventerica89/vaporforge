import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Paperclip } from 'lucide-react';

interface PromptInputProps {
  onSubmit: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming?: () => void;
  currentFileName?: string;
  /** Mobile compact mode — adds safe-bottom padding */
  compact?: boolean;
  /** When true, keyboard is open — suppresses safe-bottom padding */
  keyboardOpen?: boolean;
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 24; // ~text-sm leading

export function PromptInput({
  onSubmit,
  isStreaming,
  onStopStreaming,
  currentFileName,
  compact = false,
  keyboardOpen = false,
}: PromptInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  // Reset any residual scroll from iOS keyboard dismiss
  const handleBlur = useCallback(() => {
    if (!compact) return;
    setTimeout(() => window.scrollTo(0, 0), 100);
  }, [compact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    onSubmit(input.trim());
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Re-focus after submit on mobile
    if (compact) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStop = () => {
    if (onStopStreaming) {
      onStopStreaming();
    }
  };

  const hasInput = input.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className={`border-t border-border/60 px-4 pb-3 pt-2 ${
        compact && !keyboardOpen ? 'safe-bottom' : ''
      }`}
    >
      {/* Context chip */}
      {currentFileName && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Paperclip className="h-3 w-3 text-muted-foreground/60" />
          <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {currentFileName}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <div className="relative rounded-xl border border-border/60 bg-background transition-colors focus-within:border-primary/50 focus-within:shadow-[0_0_12px_-4px_hsl(var(--primary)/0.2)]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="Message Claude..."
            rows={1}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            style={{ color: 'hsl(var(--foreground))' }}
          />

          {/* Action button — send or stop */}
          <div className="absolute bottom-2 right-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!hasInput}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  hasInput
                    ? 'bg-primary text-primary-foreground shadow-[0_0_8px_-2px_hsl(var(--primary)/0.4)]'
                    : 'bg-muted/50 text-muted-foreground/40'
                }`}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {!compact && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Enter to send, Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
