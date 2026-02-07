import type { Message, MessagePart } from '@/lib/types';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolCallBlock } from './ToolCallBlock';

interface MessageContentProps {
  message: Message;
}

interface StreamingContentProps {
  parts: MessagePart[];
  fallbackContent: string;
}

function renderPart(part: MessagePart, index: number, isStreaming = false) {
  switch (part.type) {
    case 'text':
      return part.content ? (
        <ChatMarkdown key={index} content={part.content} />
      ) : null;

    case 'tool-start':
      return (
        <ToolCallBlock key={index} part={part} isRunning={isStreaming} />
      );

    case 'tool-result':
      return <ToolCallBlock key={index} part={part} />;

    case 'error':
      return (
        <div
          key={index}
          className="my-2 rounded-lg border border-error/50 bg-error/10 px-3 py-2 text-xs text-error"
        >
          {part.content || 'An error occurred'}
        </div>
      );

    default:
      return null;
  }
}

export function MessageContent({ message }: MessageContentProps) {
  // If message has structured parts, render each
  if (message.parts && message.parts.length > 0) {
    return (
      <>
        {message.parts.map((part, i) => renderPart(part, i))}
      </>
    );
  }

  // Fallback: render content string through ChatMarkdown
  // This handles legacy messages and messages loaded from history
  return (
    <>
      <ChatMarkdown content={message.content} />
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
          {message.toolCalls.map((tool) => (
            <ToolCallBlock
              key={tool.id}
              part={{
                type: 'tool-result',
                name: tool.name,
                input: tool.input,
                output: tool.output,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function StreamingContent({ parts, fallbackContent }: StreamingContentProps) {
  // If we have structured parts, render them (last tool-start is still running)
  if (parts.length > 0) {
    return (
      <>
        {parts.map((part, i) => {
          const isLastToolStart =
            part.type === 'tool-start' && i === parts.length - 1;
          return renderPart(part, i, isLastToolStart);
        })}
      </>
    );
  }

  // Fallback: render the raw streaming content
  if (fallbackContent) {
    return <ChatMarkdown content={fallbackContent} />;
  }

  return null;
}
