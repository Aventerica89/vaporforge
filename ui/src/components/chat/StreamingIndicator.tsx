import type { MessagePart } from '@/lib/types';
import { ThinkingBar } from '@/components/chat/thinking-bar';
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

  return <ThinkingBar text={text} />;
}
