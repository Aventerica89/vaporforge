import { useState, useRef } from 'react';
import {
  Check,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Brain,
} from 'lucide-react';
import type { ChainOfThoughtStep } from '@/lib/types';

interface ChainOfThoughtBlockProps {
  steps: ChainOfThoughtStep[];
  isStreaming?: boolean;
}

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepIcon({ status }: { status: ChainOfThoughtStep['status'] }) {
  if (status === 'complete') {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20">
        <Check className="h-3 w-3 text-success" />
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
        <div className="relative h-3 w-3 rounded-full bg-primary" />
      </div>
    );
  }

  // pending
  return (
    <div className="flex h-5 w-5 items-center justify-center">
      <Circle className="h-3 w-3 text-muted-foreground/40" />
    </div>
  );
}

function StepItem({ step, isLast }: { step: ChainOfThoughtStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(step.status === 'active');
  const contentRef = useRef<HTMLDivElement>(null);

  const hasContent = step.content || (step.searchResults && step.searchResults.length > 0);

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      {!isLast && (
        <div
          className={`absolute left-[9px] top-6 bottom-0 w-px ${
            step.status === 'active'
              ? 'bg-primary/40'
              : 'bg-border/40'
          }`}
        />
      )}

      {/* Step icon */}
      <div className="relative z-10 flex-shrink-0 pt-0.5">
        <StepIcon status={step.status} />
      </div>

      {/* Step content */}
      <div className="min-w-0 flex-1 pb-4">
        {/* Step header */}
        <button
          onClick={() => hasContent && setExpanded((prev) => !prev)}
          className={`flex w-full items-center gap-2 text-left text-xs ${
            hasContent ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {hasContent && (
            <ChevronRight
              className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          )}

          <span
            className={`font-medium ${
              step.status === 'pending'
                ? 'text-muted-foreground/50'
                : 'text-foreground'
            }`}
          >
            {step.title}
          </span>

          {/* Spacer */}
          <span className="flex-1" />

          {/* Duration for completed steps */}
          {step.status === 'complete' && step.duration != null && (
            <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/60">
              <Clock className="h-2.5 w-2.5" />
              {formatStepDuration(step.duration)}
            </span>
          )}

          {/* Shimmer for active step */}
          {step.status === 'active' && (
            <div className="ml-1 h-1.5 w-12 overflow-hidden rounded-full">
              <div className="skeleton h-full w-full" />
            </div>
          )}
        </button>

        {/* Expandable content */}
        {hasContent && (
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
            <div className="mt-2 space-y-2">
              {/* Text content */}
              {step.content && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {step.content}
                </p>
              )}

              {/* Search result badges */}
              {step.searchResults && step.searchResults.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {step.searchResults.map((result, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/60"
                    >
                      {result.url ? (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          {result.title}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        result.title
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChainOfThoughtBlock({
  steps,
  isStreaming = false,
}: ChainOfThoughtBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const completeCount = steps.filter((s) => s.status === 'complete').length;
  const totalSteps = steps.length;

  return (
    <div className="my-2">
      {/* Collapse toggle header */}
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
            collapsed ? '' : 'rotate-90'
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
          {isStreaming ? 'Reasoning...' : 'Chain of thought'}
        </span>

        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          {completeCount}/{totalSteps}
        </span>
      </button>

      {/* Steps timeline */}
      <div
        ref={contentRef}
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: collapsed
            ? '0px'
            : `${(contentRef.current?.scrollHeight || 800) + 16}px`,
          opacity: collapsed ? 0 : 1,
          overflow: 'hidden',
        }}
      >
        <div className="ml-4 mt-2">
          {steps.map((step, i) => (
            <StepItem key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
