import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
import {
  isStackTrace,
  StackTrace,
  StackTraceHeader,
  StackTraceContent,
  StackTraceFrames,
  StackTraceCopyButton,
} from '@/components/ai-elements/stack-trace';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ToolContextValue {
  name: string;
  state: ToolState;
  isGemini: boolean;
  isCitation: boolean;
  startedAt?: number;
  input?: Record<string, unknown>;
  compact?: boolean;
}

const ToolContext = createContext<ToolContextValue | null>(null);

const useTool = () => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error('Tool components must be used within Tool');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Tool — Collapsible root + context provider
// ---------------------------------------------------------------------------

export type ToolProps = ComponentProps<typeof Collapsible> & {
  name: string;
  state: ToolState;
  input?: Record<string, unknown>;
  startedAt?: number;
  compact?: boolean;
  duration?: number;
};

export const Tool = memo(
  ({
    className,
    name,
    state,
    input,
    startedAt,
    compact = false,
    children,
    ...props
  }: ToolProps) => {
    const { isGemini, isCitation } = getToolMeta(name);
    const isRunning = state === 'input-streaming';
    const isError = state === 'output-error';
    const isDenied = state === 'output-denied';

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

    const contextValue = useMemo(
      () => ({ name, state, isGemini, isCitation, startedAt, input, compact }),
      [name, state, isGemini, isCitation, startedAt, input, compact],
    );

    return (
      <ToolContext.Provider value={contextValue}>
        <Collapsible
          className={cn(
            'my-1.5 overflow-hidden rounded-lg border transition-all duration-200',
            borderClass,
            compact && 'my-1',
            className,
          )}
          {...props}
        >
          {children}
        </Collapsible>
      </ToolContext.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// ToolHeader — CollapsibleTrigger with status badge, icon, name, summary
// ---------------------------------------------------------------------------

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  duration?: number;
};

export const ToolHeader = memo(
  ({ className, duration: durationProp, ...props }: ToolHeaderProps) => {
    const { name, state, isGemini, startedAt, input, compact } = useTool();
    const isRunning = state === 'input-streaming';
    const { icon: ToolIconComponent, label } = getToolMeta(name);
    const summary = getToolSummary(name, input);
    const stateConfig = STATE_CONFIG[state] || STATE_CONFIG['input-available'];
    const { label: stateLabel, color: stateColor, Icon: StateIcon } = stateConfig;

    // Live duration counter while running
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10/30',
          className,
        )}
        {...props}
      >
        <ChevronRightIcon
          className="h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>*>&]:rotate-90"
        />

        <StateIcon
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0',
            stateColor,
            isRunning && 'animate-spin',
          )}
        />

        {isGemini ? (
          <GeminiIcon className="h-3.5 w-3.5 flex-shrink-0" />
        ) : ToolIconComponent ? (
          <ToolIconComponent className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : null}

        <span
          className={cn(
            'font-mono font-medium',
            isGemini ? 'text-blue-300' : 'text-foreground',
            compact && 'text-[11px]',
          )}
        >
          {label}
        </span>

        {summary && (
          <span className="truncate font-mono text-muted-foreground [[data-state=open]>*>&]:hidden">
            {summary}
          </span>
        )}

        <span className="flex-1" />

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
      </CollapsibleTrigger>
    );
  },
);

// ---------------------------------------------------------------------------
// ToolContent — CollapsibleContent with Radix animations
// ---------------------------------------------------------------------------

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = memo(
  ({ className, children, ...props }: ToolContentProps) => (
    <CollapsibleContent
      className={cn(
        'border-t border-border/30 text-xs',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    >
      <div className="px-3 py-2">{children}</div>
    </CollapsibleContent>
  ),
);

// ---------------------------------------------------------------------------
// ToolSchemaInput — tree view of tool input via SchemaViewer
// ---------------------------------------------------------------------------

export type ToolSchemaInputProps = ComponentProps<'div'>;

export const ToolSchemaInput = memo(
  ({ className, ...props }: ToolSchemaInputProps) => {
    const { input } = useTool();
    if (!input || Object.keys(input).length === 0) return null;

    return (
      <div className={cn('mb-2', className)} {...props}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Input
        </span>
        <SchemaViewer data={input} className="mt-1" />
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// ToolOutput — result text + error display
// ---------------------------------------------------------------------------

export type ToolOutputProps = ComponentProps<'div'> & {
  output?: string;
  errorText?: string;
};

export const ToolOutput = memo(
  ({ className, output, errorText, ...props }: ToolOutputProps) => {
    const { state } = useTool();
    const isError = state === 'output-error';
    const isDenied = state === 'output-denied';
    const isRunning = state === 'input-streaming';

    const outputIsTrace = output ? isStackTrace(output) : false;
    const errorIsTrace = errorText ? isStackTrace(errorText) : false;

    return (
      <div className={className} {...props}>
        {output && (
          outputIsTrace ? (
            <StackTrace trace={output} defaultOpen>
              <StackTraceHeader />
              <StackTraceContent>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    Stack Trace
                  </span>
                  <StackTraceCopyButton />
                </div>
                <StackTraceFrames />
              </StackTraceContent>
            </StackTrace>
          ) : (
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
          )
        )}

        {(isError || isDenied) && errorText && (
          errorIsTrace ? (
            <StackTrace trace={errorText} defaultOpen>
              <StackTraceHeader />
              <StackTraceContent>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {isDenied ? 'Denied' : 'Error'}
                  </span>
                  <StackTraceCopyButton />
                </div>
                <StackTraceFrames />
              </StackTraceContent>
            </StackTrace>
          ) : (
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
          )
        )}

        {isRunning && (
          <div className="text-muted-foreground">
            Processing tool call...
          </div>
        )}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// ToolCitation — CitationCard for WebFetch results
// ---------------------------------------------------------------------------

export type ToolCitationProps = ComponentProps<'div'>;

export const ToolCitation = memo(
  ({ className, ...props }: ToolCitationProps & { output?: string }) => {
    const { state, isCitation, input } = useTool();
    const inputUrl = typeof input?.url === 'string' ? input.url : null;
    const showCitation =
      isCitation && state === 'output-available' && !!inputUrl;

    if (!showCitation) return null;

    return (
      <div className={cn('px-2 pb-2 pt-0', className)} {...props}>
        <CitationCard url={inputUrl!} content={props.output} />
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Tool.displayName = 'Tool';
ToolHeader.displayName = 'ToolHeader';
ToolContent.displayName = 'ToolContent';
ToolSchemaInput.displayName = 'ToolSchemaInput';
ToolOutput.displayName = 'ToolOutput';
ToolCitation.displayName = 'ToolCitation';
