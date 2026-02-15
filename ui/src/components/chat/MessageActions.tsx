import { useState } from 'react';
import { Copy, Check, RotateCcw, Square, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { haptics } from '@/lib/haptics';

interface MessageActionsProps {
  content: string;
  onRetry?: () => void;
  isStreaming?: boolean;
  onStop?: () => void;
  messageId?: string;
}

export function MessageActions({
  content,
  onRetry,
  isStreaming = false,
  onStop,
  messageId,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(() => {
    if (!messageId) return null;
    const stored = localStorage.getItem(`vf_feedback_${messageId}`);
    return stored === 'up' || stored === 'down' ? stored : null;
  });
  const isTouch = useIsTouchDevice();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    haptics.light();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: 'up' | 'down') => {
    const next = feedback === type ? null : type;
    setFeedback(next);
    haptics.light();
    if (messageId) {
      if (next) {
        localStorage.setItem(`vf_feedback_${messageId}`, next);
      } else {
        localStorage.removeItem(`vf_feedback_${messageId}`);
      }
    }
  };

  // During streaming: show only the stop button
  if (isStreaming) {
    return (
      <div className="flex items-center">
        {onStop && (
          <button
            onClick={onStop}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-error/10 hover:text-error active:scale-95 transition-all"
            title="Stop generating"
            aria-label="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
            <span>Stop</span>
          </button>
        )}
      </div>
    );
  }

  // Completed message: copy, retry, thumbs up/down
  return (
    <div className={`flex items-center gap-0.5 transition-opacity ${isTouch ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'}`}>
      <button
        onClick={handleCopy}
        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground active:scale-95 transition-all"
        title="Copy message"
        aria-label="Copy message"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground active:scale-95 transition-all"
          title="Retry"
          aria-label="Retry message"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        onClick={() => handleFeedback('up')}
        className={`flex h-8 w-8 items-center justify-center rounded active:scale-95 transition-all ${
          feedback === 'up'
            ? 'text-success'
            : 'text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground'
        }`}
        title="Good response"
        aria-label="Good response"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={() => handleFeedback('down')}
        className={`flex h-8 w-8 items-center justify-center rounded active:scale-95 transition-all ${
          feedback === 'down'
            ? 'text-error'
            : 'text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground'
        }`}
        title="Bad response"
        aria-label="Bad response"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
