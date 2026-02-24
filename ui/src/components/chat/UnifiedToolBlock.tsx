import { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  getToolMeta,
  getToolSummary,
  formatDuration,
  STATE_CONFIG,
  type ToolState,
} from '@/lib/tool-utils';
import { GeminiIcon } from '@/components/icons/GeminiIcon';
import { SchemaViewer } from '@/components/elements/SchemaViewer';
import { CitationCard } from '@/components/ai-elements/CitationCard';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UnifiedToolBlockProps {
  name: string;
  state: ToolState;
  input?: Record<string, unknown>;
  output?: string;
  errorText?: string;
  toolId?: string;
  startedAt?: number;
  duration?: number;
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedToolBlock({
  name,
  state,
  input,
  output,
  errorText,
  startedAt,
  duration: durationProp,
  compact = false,
  className,
}: UnifiedToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const isRunning = state === 'input-streaming';
  const isError = state === 'output-error';
  const isDenied = state === 'output-denied';
  const { icon: ToolIcon, label, isGemini, isCitation } = getToolMeta(name);
  const summary = getToolSummary(name, input);
  const inputUrl = typeof input?.url === 'string' ? input.url : null;
  const showCitation =
    isCitation && state === 'output-available' && !!inputUrl;

  // State badge from the 6-state config
  const stateConfig = STATE_CONFIG[state] || STATE_CONFIG['input-available'];
  const { label: stateLabel, color: stateColor, Icon: StateIcon } = stateConfig;

  // Live duration counter while running
  useEffect(() => {
    if (isRunning && startedAt) {
      setElapsed(Date.now() - startedAt);
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - (startedAt || Date.now()));
      }, 100);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, startedAt]);

  const displayDuration = isRunning ? elapsed : durationProp;

  // Border color based on state + tool type
  const borderClass = isGemini
    ? isRunning
      ? 'border-blue-500/40 shadow-[0_0_12px_-2px_rgba(66,133,244,0.25)]'
      : isError || isDenied
        ? 'border-error/30'
        : 'border-blue-400/20'
    : isRunning
      ? 'border-primary/50 shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]'
      : isError || isDenied
        ? 'border-error/30'
        : 'border-border/60';

  return (
    <div
      className={cn(
        'my-1.5 overflow-hidden rounded-lg border transition-all duration-200',
        borderClass,
        compact && 'my-1',
        className,
      )}
    >
      {/* Header — clickable row */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30"
      >
        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />

        {/* Status icon from state config */}
        <StateIcon
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0',
            stateColor,
            isRunning && 'animate-spin',
          )}
        />

        {/* Tool-specific icon */}
        {isGemini ? (
          <GeminiIcon className="h-3.5 w-3.5 flex-shrink-0" />
        ) : ToolIcon ? (
          <ToolIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : null}

        {/* Tool name */}
        <span
          className={cn(
            'font-mono font-medium',
            isGemini ? 'text-blue-300' : 'text-foreground',
            compact && 'text-[11px]',
          )}
        >
          {label}
        </span>

        {/* Smart summary (file path / command / URL) */}
        {summary && !expanded && (
          <span className="truncate font-mono text-muted-foreground">
            {summary}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* State label (compact, from 6-state config) */}
        {!isRunning && state !== 'output-available' && (
          <span
            className={cn(
              'flex-shrink-0 text-[10px] font-medium',
              stateColor,
            )}
          >
            {stateLabel}
          </span>
        )}

        {/* Duration */}
        {displayDuration != null && displayDuration > 0 && (
          <span className="flex-shrink-0 tabular-nums font-mono text-muted-foreground">
            {formatDuration(displayDuration)}
          </span>
        )}

        {isRunning && !displayDuration && (
          <span className="flex-shrink-0 text-muted-foreground">
            {stateLabel}
          </span>
        )}
      </button>

      {/* Citation card — always visible for completed WebFetch results */}
      {showCitation && (
        <div className="px-2 pb-2 pt-0">
          <CitationCard url={inputUrl!} content={output} />
        </div>
      )}

      {/* Expandable details with CSS transition */}
      <div
        ref={contentRef}
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded
            ? `${(contentRef.current?.scrollHeight || 500) + 16}px`
            : '0px',
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div className="border-t border-border/30 px-3 py-2 text-xs">
          {/* Input params — SchemaViewer tree */}
          {input && Object.keys(input).length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Input
              </span>
              <SchemaViewer data={input} className="mt-1" />
            </div>
          )}

          {/* Output */}
          {output && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Output
              </span>
              <pre className="mt-1 max-h-48 overflow-y-auto overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                {output.length > 2000
                  ? `${output.slice(0, 2000)}...(truncated)`
                  : output}
              </pre>
            </div>
          )}

          {/* Error content */}
          {(isError || isDenied) && errorText && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {isDenied ? 'Denied' : 'Error'}
              </span>
              <pre
                className={cn(
                  'mt-1 rounded-md border p-2 font-mono text-[11px] leading-relaxed',
                  isDenied
                    ? 'border-orange-500/20 bg-orange-500/5 text-orange-400'
                    : 'border-red-500/20 bg-red-500/5 text-red-400',
                )}
              >
                {errorText}
              </pre>
            </div>
          )}

          {/* Streaming placeholder */}
          {isRunning && !input && (
            <div className="text-muted-foreground">
              Processing tool call...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
