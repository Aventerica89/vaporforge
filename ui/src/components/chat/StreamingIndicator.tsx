import type { MessagePart } from '@/lib/types';
import { AgentStatusBadge } from '@/components/elements/AgentStatusBadge';

interface StreamingIndicatorProps {
  parts: MessagePart[];
  hasContent: boolean;
}

export function StreamingIndicator({ parts, hasContent }: StreamingIndicatorProps) {
  const lastPart = parts[parts.length - 1];
  const isToolRunning = lastPart?.type === 'tool-start';
  const isReasoning = lastPart?.type === 'reasoning';

  let status: 'thinking' | 'acting' | 'waiting' = 'thinking';
  let label = 'Thinking';

  if (isToolRunning && lastPart.name) {
    status = 'acting';
    label = lastPart.name;
  } else if (isReasoning) {
    status = 'thinking';
    label = 'Reasoning';
  } else if (hasContent) {
    status = 'acting';
    label = 'Writing';
  }

  return (
    <div className="flex flex-col gap-2">
      <AgentStatusBadge status={status} label={label} />

      {/* Shimmer skeleton lines while waiting for first content */}
      {!hasContent && !isToolRunning && (
        <div className="flex flex-col gap-1.5 pl-1">
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      )}
    </div>
  );
}
