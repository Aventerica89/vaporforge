import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Stack trace parsing
// ---------------------------------------------------------------------------

const STACK_FRAME_WITH_PARENS = /^\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/;
const STACK_FRAME_WITHOUT_FN = /^\s+at\s+(.+?):(\d+):(\d+)$/;
const ERROR_TYPE_REGEX = /^(\w+Error):\s*(.*)$/;

export interface StackFrame {
  raw: string;
  functionName?: string;
  filePath?: string;
  line?: number;
  column?: number;
  isInternal: boolean;
}

export interface ParsedStackTrace {
  errorType?: string;
  errorMessage?: string;
  frames: StackFrame[];
  raw: string;
}

function parseStackTrace(trace: string): ParsedStackTrace {
  const lines = trace.split('\n');
  let errorType: string | undefined;
  let errorMessage: string | undefined;
  const frames: StackFrame[] = [];

  for (const line of lines) {
    const errorMatch = line.match(ERROR_TYPE_REGEX);
    if (errorMatch && !errorType) {
      errorType = errorMatch[1];
      errorMessage = errorMatch[2];
      continue;
    }

    const withParens = line.match(STACK_FRAME_WITH_PARENS);
    if (withParens) {
      const filePath = withParens[2];
      frames.push({
        raw: line,
        functionName: withParens[1],
        filePath,
        line: parseInt(withParens[3], 10),
        column: parseInt(withParens[4], 10),
        isInternal: filePath.includes('node_modules') || filePath.startsWith('node:'),
      });
      continue;
    }

    const withoutFn = line.match(STACK_FRAME_WITHOUT_FN);
    if (withoutFn) {
      const filePath = withoutFn[1];
      frames.push({
        raw: line,
        filePath,
        line: parseInt(withoutFn[2], 10),
        column: parseInt(withoutFn[3], 10),
        isInternal: filePath.includes('node_modules') || filePath.startsWith('node:'),
      });
      continue;
    }
  }

  return { errorType, errorMessage, frames, raw: trace };
}

/** Returns true if the text looks like a JS/Node stack trace */
export function isStackTrace(text: string): boolean {
  return ERROR_TYPE_REGEX.test(text) && /^\s+at\s+/m.test(text);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface StackTraceContextValue {
  parsed: ParsedStackTrace;
}

const StackTraceCtx = createContext<StackTraceContextValue | null>(null);

const useStackTraceCtx = () => {
  const ctx = useContext(StackTraceCtx);
  if (!ctx) throw new Error('StackTrace components must be used within StackTrace');
  return ctx;
};

// ---------------------------------------------------------------------------
// StackTrace — root Collapsible + context provider
// ---------------------------------------------------------------------------

export type StackTraceProps = ComponentProps<typeof Collapsible> & {
  trace: string;
};

export const StackTrace = memo(
  ({ className, trace, children, ...props }: StackTraceProps) => {
    const parsed = useMemo(() => parseStackTrace(trace), [trace]);
    const contextValue = useMemo(() => ({ parsed }), [parsed]);

    return (
      <StackTraceCtx.Provider value={contextValue}>
        <Collapsible
          className={cn(
            'overflow-hidden rounded-md border border-red-500/20 bg-red-500/5',
            className,
          )}
          {...props}
        >
          {children}
        </Collapsible>
      </StackTraceCtx.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// StackTraceHeader — CollapsibleTrigger with error type + message
// ---------------------------------------------------------------------------

export type StackTraceHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

export const StackTraceHeader = memo(
  ({ className, ...props }: StackTraceHeaderProps) => {
    const { parsed } = useStackTraceCtx();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-red-500/10',
          className,
        )}
        {...props}
      >
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-red-400 transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
        {parsed.errorType && (
          <span className="font-mono font-semibold text-red-400">{parsed.errorType}</span>
        )}
        {parsed.errorMessage && (
          <span className="truncate font-mono text-red-300/80 [[data-state=open]>*>&]:whitespace-normal [[data-state=open]>*>&]:break-words">
            {parsed.errorMessage}
          </span>
        )}
        <span className="flex-1" />
        {parsed.frames.length > 0 && (
          <span className="flex-shrink-0 tabular-nums font-mono text-muted-foreground">
            {parsed.frames.length} frame{parsed.frames.length !== 1 ? 's' : ''}
          </span>
        )}
      </CollapsibleTrigger>
    );
  },
);

// ---------------------------------------------------------------------------
// StackTraceContent — CollapsibleContent with Radix animations
// ---------------------------------------------------------------------------

export type StackTraceContentProps = ComponentProps<typeof CollapsibleContent>;

export const StackTraceContent = memo(
  ({ className, children, ...props }: StackTraceContentProps) => (
    <CollapsibleContent
      className={cn(
        'border-t border-red-500/10 text-xs',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    >
      <div className="max-h-64 overflow-y-auto px-3 py-2">{children}</div>
    </CollapsibleContent>
  ),
);

// ---------------------------------------------------------------------------
// StackTraceFrames — renders parsed frames with internal dimming
// ---------------------------------------------------------------------------

export type StackTraceFramesProps = ComponentProps<'div'> & {
  showInternal?: boolean;
  onFileClick?: (filePath: string, line?: number, column?: number) => void;
};

export const StackTraceFrames = memo(
  ({ className, showInternal = true, onFileClick, ...props }: StackTraceFramesProps) => {
    const { parsed } = useStackTraceCtx();
    const visibleFrames = showInternal
      ? parsed.frames
      : parsed.frames.filter((f) => !f.isInternal);

    return (
      <div className={cn('space-y-0.5 font-mono text-[11px]', className)} {...props}>
        {visibleFrames.map((frame, i) => (
          <StackFrameRow key={i} frame={frame} onFileClick={onFileClick} />
        ))}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// StackFrameRow — individual frame line
// ---------------------------------------------------------------------------

const StackFrameRow = memo(
  ({
    frame,
    onFileClick,
  }: {
    frame: StackFrame;
    onFileClick?: (filePath: string, line?: number, column?: number) => void;
  }) => {
    const handleClick = useCallback(() => {
      if (frame.filePath && onFileClick) {
        onFileClick(frame.filePath, frame.line, frame.column);
      }
    }, [frame, onFileClick]);

    const isClickable = !!frame.filePath && !!onFileClick;

    return (
      <div
        className={cn(
          'flex items-baseline gap-1.5 leading-relaxed',
          frame.isInternal && 'opacity-40',
        )}
      >
        <span className="flex-shrink-0 text-red-400/60">at</span>
        {frame.functionName && (
          <span className="text-red-300">{frame.functionName}</span>
        )}
        {frame.filePath && (
          <span
            className={cn(
              'truncate text-muted-foreground',
              isClickable && 'cursor-pointer underline decoration-dotted hover:text-red-300',
            )}
            onClick={isClickable ? handleClick : undefined}
          >
            {frame.filePath}
            {frame.line != null && `:${frame.line}`}
            {frame.column != null && `:${frame.column}`}
          </span>
        )}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// StackTraceCopyButton — copies raw trace to clipboard
// ---------------------------------------------------------------------------

export type StackTraceCopyButtonProps = ComponentProps<'button'> & {
  timeout?: number;
};

export const StackTraceCopyButton = memo(
  ({ className, timeout = 2000, ...props }: StackTraceCopyButtonProps) => {
    const { parsed } = useStackTraceCtx();
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
      await navigator.clipboard.writeText(parsed.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    }, [parsed.raw, timeout]);

    return (
      <button
        type="button"
        className={cn(
          'flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300',
          className,
        )}
        onClick={handleCopy}
        aria-label="Copy stack trace" title="Copy stack trace"
        {...props}
      >
        {copied ? (
          <CheckIcon className="h-3 w-3 text-green-400" />
        ) : (
          <CopyIcon className="h-3 w-3" />
        )}
      </button>
    );
  },
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

StackTrace.displayName = 'StackTrace';
StackTraceHeader.displayName = 'StackTraceHeader';
StackTraceContent.displayName = 'StackTraceContent';
StackTraceFrames.displayName = 'StackTraceFrames';
StackTraceCopyButton.displayName = 'StackTraceCopyButton';
