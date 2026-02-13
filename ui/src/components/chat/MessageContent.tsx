import type { Message, MessagePart } from '@/lib/types';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolCallBlock } from './ToolCallBlock';
import { ReasoningBlock } from './ReasoningBlock';
import { ArtifactBlock } from './ArtifactBlock';
import { ChainOfThoughtBlock } from './ChainOfThoughtBlock';

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

    case 'reasoning':
      return (
        <ReasoningBlock
          key={index}
          content={part.content || ''}
          isStreaming={isStreaming}
        />
      );

    case 'tool-start':
      return (
        <ToolCallBlock key={index} part={part} isRunning={isStreaming} />
      );

    case 'tool-result':
      return <ToolCallBlock key={index} part={part} />;

    case 'artifact':
      return (
        <ArtifactBlock
          key={index}
          code={part.content || ''}
          language={part.language || 'text'}
          filename={part.filename}
        />
      );

    case 'chain-of-thought':
      return part.steps ? (
        <ChainOfThoughtBlock
          key={index}
          steps={part.steps}
          isStreaming={isStreaming}
        />
      ) : null;

    case 'error':
      return (
        <div
          key={index}
          className="my-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error"
        >
          {part.content || 'An error occurred'}
        </div>
      );

    default:
      return null;
  }
}

export function MessageContent({ message }: MessageContentProps) {
  if (message.parts && message.parts.length > 0) {
    return (
      <>
        {message.parts.map((part, i) => renderPart(part, i))}
      </>
    );
  }

  return (
    <>
      <ChatMarkdown content={message.content} />
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
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
  if (parts.length > 0) {
    return (
      <>
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          const isStreamingPart =
            isLast && (part.type === 'tool-start' || part.type === 'reasoning' || part.type === 'chain-of-thought');
          return renderPart(part, i, isStreamingPart);
        })}
      </>
    );
  }

  if (fallbackContent) {
    return <ChatMarkdown content={fallbackContent} />;
  }

  return null;
}
