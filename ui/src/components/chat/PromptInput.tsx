import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface PromptInputProps {
  onSubmit: (message: string) => void;
  isStreaming: boolean;
  currentFileName?: string;
}

export function PromptInput({ onSubmit, isStreaming, currentFileName }: PromptInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    onSubmit(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-border p-4">
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

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
