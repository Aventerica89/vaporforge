import { useState } from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { haptics } from '@/lib/haptics';

interface MessageActionsProps {
  content: string;
  onRetry?: () => void;
}

export function MessageActions({ content, onRetry }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const isTouch = useIsTouchDevice();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    haptics.light();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center gap-1 transition-opacity ${isTouch ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'}`}>
      <button
        onClick={handleCopy}
        className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground active:scale-95 transition-all"
        title="Copy message"
        aria-label="Copy message"
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground active:scale-95 transition-all"
          title="Retry"
          aria-label="Retry message"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
