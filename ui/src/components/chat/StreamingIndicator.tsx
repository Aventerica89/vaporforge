import type { MessagePart } from '@/lib/types';
import { ThinkingBar } from '@/components/prompt-kit/thinking-bar';
import { AgentStatusBadge } from '@/components/elements/AgentStatusBadge';

interface StreamingIndicatorProps {
  parts: MessagePart[];
  hasContent: boolean;
}

export function StreamingIndicator({ parts }: StreamingIndicatorProps) {
  const lastPart = parts[parts.length - 1];
  const isToolRunning = lastPart?.type === 'tool-start';
  const isReasoning = lastPart?.type === 'reasoning';

  // Tool execution: keep the acting badge with tool name
  if (isToolRunning && lastPart.name) {
    return <AgentStatusBadge status="acting" label={lastPart.name} />;
  }

  const text = isReasoning ? 'Reasoning' : 'Thinking';

  return (
    <div className="flex flex-col gap-2">
      <ThinkingBar text={text} />
      <div className="flex flex-col gap-1.5 pl-1">
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-3 w-5/6" />
      </div>
    </div>
  );
}
