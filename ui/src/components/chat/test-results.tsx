import { cn } from '@/lib/cn';
import {
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Loader2,
  SkipForward,
  XCircle,
} from 'lucide-react';
import React, { createContext, useContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TestStatus = 'pass' | 'fail' | 'running' | 'skip';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type TestResultsContextType = {
  status: TestStatus;
  suiteName?: string;
};

const TestResultsContext = createContext<TestResultsContextType | undefined>(undefined);

function useTestResultsContext() {
  const context = useContext(TestResultsContext);
  if (!context) {
    throw new Error('useTestResultsContext must be used within a TestResults provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Status config helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
  TestStatus,
  { label: string; className: string }
> = {
  pass: {
    label: 'passed',
    className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
  },
  fail: {
    label: 'failed',
    className: 'bg-red-500/10 text-red-500 border-red-500/25',
  },
  skip: {
    label: 'skipped',
    className: 'bg-muted text-muted-foreground border-border/50',
  },
  running: {
    label: 'running',
    className: 'bg-primary/10 text-primary border-primary/25',
  },
};

const CASE_STATUS_ICON: Record<TestStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />,
  fail: <XCircle className="size-3.5 shrink-0 text-red-500" />,
  skip: <SkipForward className="size-3.5 shrink-0 text-muted-foreground" />,
  running: <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />,
};

// ---------------------------------------------------------------------------
// Root — TestResults
// ---------------------------------------------------------------------------

export type TestResultsProps = {
  status: TestStatus;
  suiteName?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function TestResults({
  status,
  suiteName,
  passed,
  failed,
  skipped,
  children,
  className,
  ...props
}: TestResultsProps) {
  return (
    <TestResultsContext.Provider value={{ status, suiteName }}>
      <div
        className={cn(
          'rounded-lg border border-border/50 bg-muted/20 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </TestResultsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TestResultsHeader
// ---------------------------------------------------------------------------

export type TestResultsHeaderProps = {
  passed?: number;
  failed?: number;
  skipped?: number;
  className?: string;
} & React.ComponentProps<'div'>;

export function TestResultsHeader({
  passed,
  failed,
  skipped,
  className,
  ...props
}: TestResultsHeaderProps) {
  const { status, suiteName } = useTestResultsContext();
  const badge = STATUS_BADGE[status];

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2',
        className,
      )}
      {...props}
    >
      {/* Suite icon + name */}
      <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
      {suiteName && (
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
          {suiteName}
        </span>
      )}

      {/* Summary chips */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {passed !== undefined && (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-emerald-500">
            <CheckCircle2 className="size-3" />
            {passed}
          </span>
        )}
        {failed !== undefined && (
          <span className="inline-flex items-center gap-1 rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-red-500">
            <XCircle className="size-3" />
            {failed}
          </span>
        )}
        {skipped !== undefined && (
          <span className="inline-flex items-center gap-1 rounded border border-border/50 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-muted-foreground">
            <SkipForward className="size-3" />
            {skipped}
          </span>
        )}

        {/* Overall status badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none',
            badge.className,
          )}
        >
          {status === 'running' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : null}
          {badge.label}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestResultsBody — collapsible container
// ---------------------------------------------------------------------------

export type TestResultsBodyProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
} & React.ComponentProps<'div'>;

export function TestResultsBody({
  children,
  defaultOpen = true,
  className,
  ...props
}: TestResultsBodyProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('px-3 py-1.5', className)} {...props}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 py-1 text-xs text-muted-foreground',
          'transition-colors hover:text-foreground',
        )}
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-150',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
        <span>Test cases</span>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-[opacity,transform] duration-150',
          open
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0',
        )}
        aria-hidden={!open}
      >
        <ul className="space-y-0.5 pb-1.5 pl-5 pt-0.5">{children}</ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestCase — individual test row
// ---------------------------------------------------------------------------

export type TestCaseProps = {
  name: string;
  status: TestStatus;
  duration?: number;
  error?: string;
  className?: string;
} & Omit<React.ComponentProps<'li'>, 'children'>;

export function TestCase({
  name,
  status,
  duration,
  error,
  className,
  ...props
}: TestCaseProps) {
  const icon = CASE_STATUS_ICON[status];

  return (
    <li className={cn('flex flex-col gap-0.5 py-0.5', className)} {...props}>
      <div className="flex items-center gap-2">
        {icon}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            status === 'fail' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {name}
        </span>
        {duration !== undefined && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {duration}ms
          </span>
        )}
      </div>
      {status === 'fail' && error && <TestCaseError error={error} />}
    </li>
  );
}

// ---------------------------------------------------------------------------
// TestCaseError — collapsible error details
// ---------------------------------------------------------------------------

export type TestCaseErrorProps = {
  error: string;
  className?: string;
} & React.ComponentProps<'div'>;

export function TestCaseError({ error, className, ...props }: TestCaseErrorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('pl-5', className)} {...props}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex cursor-pointer items-center gap-1 text-[10px] text-red-500/70',
          'transition-colors hover:text-red-500',
        )}
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform duration-150',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
        <span>{open ? 'hide error' : 'show error'}</span>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-[opacity,transform] duration-150',
          open
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0',
        )}
        aria-hidden={!open}
      >
        <pre
          className={cn(
            'mt-1 rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5',
            'overflow-x-auto font-mono text-[10px] leading-relaxed text-red-400',
          )}
        >
          {error}
        </pre>
      </div>
    </div>
  );
}
