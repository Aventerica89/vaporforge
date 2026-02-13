import type { MessagePart } from '@/lib/types';

interface StreamingIndicatorProps {
  parts: MessagePart[];
  hasContent: boolean;
}

export function StreamingIndicator({ parts, hasContent }: StreamingIndicatorProps) {
  const lastPart = parts[parts.length - 1];
  const isToolRunning = lastPart?.type === 'tool-start';
  const isReasoning = lastPart?.type === 'reasoning';

  let label = 'Thinking';
  if (isToolRunning && lastPart.name) {
    label = `Running ${lastPart.name}`;
  } else if (isReasoning) {
    label = 'Reasoning';
  } else if (hasContent) {
    label = 'Writing';
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Status label with pulse */}
      <div className="flex items-center gap-2">
        <div className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>

      {/* Shimmer skeleton lines */}
      {!hasContent && !isToolRunning && (
        <div className="flex flex-col gap-1.5">
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      )}
    </div>
  );
}
