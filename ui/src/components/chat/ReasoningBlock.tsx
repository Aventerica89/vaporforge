import { useState, useRef } from 'react';
import { ChevronRight, Brain } from 'lucide-react';

interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ReasoningBlock({ content, isStreaming = false }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />

        {isStreaming ? (
          <div className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary/30" />
            <Brain className="relative h-3.5 w-3.5 text-secondary" />
          </div>
        ) : (
          <Brain className="h-3.5 w-3.5 text-secondary/60" />
        )}

        <span className="font-medium text-muted-foreground">
          {isStreaming ? 'Thinking...' : 'Thought process'}
        </span>

        {/* Shimmer bar when streaming and collapsed */}
        {isStreaming && !expanded && (
          <div className="ml-1 h-1.5 w-16 overflow-hidden rounded-full">
            <div className="skeleton h-full w-full" />
          </div>
        )}
      </button>

      {/* Expandable content */}
      <div
        ref={contentRef}
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded
            ? `${(contentRef.current?.scrollHeight || 400) + 16}px`
            : '0px',
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div className="ml-2 mt-1 border-l-2 border-secondary/20 pl-3 text-xs leading-relaxed text-muted-foreground">
          {content}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-secondary/60" />
          )}
        </div>
      </div>
    </div>
  );
}
