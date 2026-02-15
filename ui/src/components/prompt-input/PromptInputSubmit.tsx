import { ArrowUp, Square, Loader2 } from 'lucide-react';
import { usePromptInput } from './context';
import { cn } from '@/lib/cn';

export function PromptInputSubmit() {
  const { status, hasInput, onStop } = usePromptInput();

  if (status === 'streaming') {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
        title="Stop generating"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
    );
  }

  if (status === 'uploading') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <button
      type="submit"
      disabled={!hasInput}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
        hasInput
          ? 'bg-primary text-primary-foreground shadow-[0_0_8px_-2px_hsl(var(--primary)/0.4)]'
          : 'bg-muted/50 text-muted-foreground/40',
      )}
      title="Send message"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
