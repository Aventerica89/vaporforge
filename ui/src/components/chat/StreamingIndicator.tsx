import type { MessagePart } from '@/lib/types';

interface StreamingIndicatorProps {
  parts: MessagePart[];
  hasContent: boolean;
}

export function StreamingIndicator({ parts, hasContent }: StreamingIndicatorProps) {
  const lastPart = parts[parts.length - 1];
  const isToolRunning = lastPart?.type === 'tool-start';

  let label = 'Thinking';
  if (isToolRunning && lastPart.name) {
    label = `Using ${lastPart.name}`;
  } else if (hasContent) {
    label = 'Writing';
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
      </span>
      <span>{label}</span>
    </span>
  );
}
