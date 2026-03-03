import { cn } from '@/lib/cn';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import React, { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckpointStatus = 'pending' | 'active' | 'complete' | 'error';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type CheckpointContextType = {
  status: CheckpointStatus;
  title: string;
};

const CheckpointContext = createContext<CheckpointContextType | undefined>(undefined);

function useCheckpointContext() {
  const context = useContext(CheckpointContext);
  if (!context) {
    throw new Error('useCheckpointContext must be used within a Checkpoint provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// CheckpointIcon
// ---------------------------------------------------------------------------

export type CheckpointIconProps = {
  status?: CheckpointStatus;
  className?: string;
} & React.ComponentProps<'span'>;

export function CheckpointIcon({ status: statusProp, className, ...props }: CheckpointIconProps) {
  const ctx = useContext(CheckpointContext);
  const status = statusProp ?? ctx?.status ?? 'pending';

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      aria-hidden
      {...props}
    >
      {status === 'active' && (
        <span className="absolute size-6 animate-ping rounded-full bg-primary/30 opacity-75" />
      )}
      <span
        className={cn(
          'relative inline-flex size-6 items-center justify-center rounded-full',
          status === 'pending' && 'bg-muted',
          status === 'active' && 'bg-primary/15',
          status === 'complete' && 'bg-emerald-500/15',
          status === 'error' && 'bg-red-500/15',
        )}
      >
        {status === 'pending' && (
          <Clock className="size-3.5 text-muted-foreground" />
        )}
        {status === 'active' && (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        )}
        {status === 'complete' && (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        )}
        {status === 'error' && (
          <XCircle className="size-3.5 text-red-500" />
        )}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// CheckpointContent
// ---------------------------------------------------------------------------

export type CheckpointContentProps = {
  title?: string;
  description?: string;
  className?: string;
} & React.ComponentProps<'div'>;

export function CheckpointContent({
  title: titleProp,
  description,
  className,
  children,
  ...props
}: CheckpointContentProps) {
  const ctx = useCheckpointContext();
  const title = titleProp ?? ctx.title;
  const status = ctx.status;

  return (
    <div className={cn('min-w-0 flex-1', className)} {...props}>
      {title && (
        <span
          className={cn(
            'text-sm font-medium leading-none',
            status === 'pending' && 'text-muted-foreground',
            status === 'active' && 'text-foreground',
            status === 'complete' && 'text-foreground',
            status === 'error' && 'text-red-400',
          )}
        >
          {title}
        </span>
      )}
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</p>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckpointMeta
// ---------------------------------------------------------------------------

export type CheckpointMetaProps = {
  index?: number;
  timestamp?: string;
  className?: string;
} & React.ComponentProps<'div'>;

export function CheckpointMeta({ index, timestamp, className, ...props }: CheckpointMetaProps) {
  if (index === undefined && !timestamp) return null;

  return (
    <div
      className={cn('flex shrink-0 items-center gap-1.5', className)}
      {...props}
    >
      {index !== undefined && (
        <span className="inline-flex size-4 items-center justify-center rounded bg-muted font-mono text-[10px] font-semibold leading-none text-muted-foreground">
          {index}
        </span>
      )}
      {timestamp && (
        <span className="font-mono text-[11px] text-muted-foreground">{timestamp}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — Checkpoint
// ---------------------------------------------------------------------------

export type CheckpointProps = {
  status: CheckpointStatus;
  title: string;
  description?: string;
  timestamp?: string;
  index?: number;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'title'>;

export function Checkpoint({
  status,
  title,
  description,
  timestamp,
  index,
  children,
  className,
  ...props
}: CheckpointProps) {
  return (
    <CheckpointContext.Provider value={{ status, title }}>
      <div
        className={cn(
          'flex items-start gap-2.5 py-1',
          className,
        )}
        {...props}
      >
        <CheckpointIcon />
        <CheckpointContent title={title} description={description} />
        {(index !== undefined || timestamp) && (
          <CheckpointMeta index={index} timestamp={timestamp} />
        )}
        {children}
      </div>
    </CheckpointContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CheckpointList
// ---------------------------------------------------------------------------

export type CheckpointListProps = {
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<'div'>;

export function CheckpointList({ children, className, ...props }: CheckpointListProps) {
  return (
    <div
      className={cn('flex flex-col', className)}
      {...props}
    >
      {React.Children.map(children, (child, i) => {
        const isLast = i === React.Children.count(children) - 1;
        return (
          <div key={i} className="flex items-stretch gap-0">
            {/* Timeline track */}
            <div className="flex w-6 shrink-0 flex-col items-center">
              <div className="mt-1 size-6 shrink-0" aria-hidden />
              {!isLast && (
                <div className="w-px flex-1 bg-border/50" aria-hidden />
              )}
            </div>
            {/* Content — offset to align with icon column */}
            <div className="min-w-0 flex-1 pl-2.5">
              {child}
            </div>
          </div>
        );
      })}
    </div>
  );
}
