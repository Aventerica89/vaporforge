import { useState } from 'react';
import { ChevronRight, Loader2, Check, X } from 'lucide-react';
import type { MessagePart } from '@/lib/types';

interface ToolCallBlockProps {
  part: MessagePart;
  isRunning?: boolean;
}

export function ToolCallBlock({ part, isRunning = false }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const isError = part.type === 'error';
  const toolName = part.name || 'Unknown tool';

  return (
    <div
      className={`my-2 overflow-hidden rounded-lg border transition-colors ${
        isRunning
          ? 'border-primary/50 shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]'
          : isError
            ? 'border-error/50'
            : 'border-border'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left text-xs hover:bg-muted/50"
      >
        <ChevronRight
          className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />

        {/* Status icon */}
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
        ) : isError ? (
          <X className="h-3.5 w-3.5 flex-shrink-0 text-error" />
        ) : (
          <Check className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        )}

        <span className="font-mono font-medium text-foreground">
          {toolName}
        </span>

        {isRunning && (
          <span className="text-muted-foreground">Running...</span>
        )}
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-border/50 bg-background/40 px-3 py-2 text-xs">
          {/* Input params */}
          {part.input && Object.keys(part.input).length > 0 && (
            <div className="mb-2">
              <span className="font-medium text-muted-foreground">Input:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-background/60 p-2 font-mono text-foreground">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {part.output && (
            <div>
              <span className="font-medium text-muted-foreground">Output:</span>
              <pre className="mt-1 max-h-48 overflow-y-auto overflow-x-auto rounded bg-background/60 p-2 font-mono text-foreground">
                {part.output.length > 2000
                  ? `${part.output.slice(0, 2000)}...(truncated)`
                  : part.output}
              </pre>
            </div>
          )}

          {/* Error content */}
          {isError && part.content && (
            <div className="text-error">{part.content}</div>
          )}
        </div>
      )}
    </div>
  );
}
