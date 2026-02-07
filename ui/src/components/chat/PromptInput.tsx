import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface PromptInputProps {
  onSubmit: (message: string) => void;
  isStreaming: boolean;
  currentFileName?: string;
  /** Mobile compact mode — adds safe-bottom padding */
  compact?: boolean;
  /** When true, keyboard is open — suppresses safe-bottom padding */
  keyboardOpen?: boolean;
}

export function PromptInput({
  onSubmit,
  isStreaming,
  currentFileName,
  compact = false,
  keyboardOpen = false,
}: PromptInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
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

    // Re-focus after submit on mobile
    if (compact) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`border-t border-border p-4 ${compact && !keyboardOpen ? 'safe-bottom' : ''}`}
    >
      {/* File context indicator */}
      {currentFileName && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          <span>Context: {currentFileName}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Ask Claude..."
          rows={1}
          disabled={isStreaming}
          className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          style={{ color: 'hsl(var(--foreground))' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="absolute bottom-3 right-3 rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isStreaming ? (
            <Square className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>

      {!compact && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
