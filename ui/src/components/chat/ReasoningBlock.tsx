import { useState, useRef, useEffect } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, Brain } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Shimmer } from '../ai-elements/Shimmer';
import { ChatMarkdown } from './ChatMarkdown';

interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ReasoningBlock({
  content,
  isStreaming = false,
}: ReasoningBlockProps) {
  const [open, setOpen] = useState(false);

  // Duration tracking: start when content first appears, end when streaming stops
  const startTimeRef = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  // Auto-close guard: only auto-close once per reasoning block
  const hasAutoClosedRef = useRef(false);

  // Start timer when content first appears during streaming
  useEffect(() => {
    if (isStreaming && content && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
  }, [isStreaming, content]);

  // Auto-open when streaming reasoning starts
  useEffect(() => {
    if (isStreaming && content) {
      setOpen(true);
    }
  }, [isStreaming, content]);

  // Auto-close ~1s after streaming ends, compute final duration
  useEffect(() => {
    if (!isStreaming && startTimeRef.current && !hasAutoClosedRef.current) {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setDuration(elapsed);
      hasAutoClosedRef.current = true;

      const timer = setTimeout(() => setOpen(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  const triggerLabel = isStreaming
    ? null // will show Shimmer instead
    : duration !== null
      ? `Thought for ${duration}s`
      : 'Thought process';

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="my-2">
      <Collapsible.Trigger
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs',
          'transition-colors hover:bg-muted/30',
          'group cursor-pointer select-none',
        )}
      >
        {/* Brain icon — pulsing when streaming */}
        {isStreaming ? (
          <div className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary/30" />
            <Brain className="relative h-3.5 w-3.5 text-secondary" />
          </div>
        ) : (
          <Brain className="h-3.5 w-3.5 text-secondary/60" />
        )}

        {/* Label or shimmer */}
        {isStreaming ? (
          <Shimmer className="text-xs font-medium">Thinking...</Shimmer>
        ) : (
          <span className="font-medium text-muted-foreground">
            {triggerLabel}
          </span>
        )}

        {/* Shimmer bar when streaming + collapsed */}
        {isStreaming && !open && (
          <div className="ml-1 h-1.5 w-16 overflow-hidden rounded-full">
            <div className="skeleton h-full w-full" />
          </div>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'ml-auto h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="ml-2 mt-1 border-l-2 border-secondary/20 pl-3 text-xs leading-relaxed text-muted-foreground">
          <ChatMarkdown content={content} />
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-secondary/60" />
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
