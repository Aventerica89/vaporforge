import { useState } from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';

interface MessageActionsProps {
  content: string;
  onRetry?: () => void;
}

export function MessageActions({ content, onRetry }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
      <button
        onClick={handleCopy}
        className="rounded p-1 text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground"
        title="Copy message"
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
          className="rounded p-1 text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground"
          title="Retry"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
