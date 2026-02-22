import { cn } from '@/lib/cn';
import { ClaudeIcon } from '@/components/icons/ClaudeIcon';
import { ArrowRight, Check, Clock, Zap } from 'lucide-react';
import React, { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'done' | 'handoff';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type AgentStatusContextType = {
  status: AgentState;
  label: string;
};

const AgentStatusContext = createContext<AgentStatusContextType | undefined>(undefined);

function useAgentStatusContext() {
  const context = useContext(AgentStatusContext);
  if (!context) {
    throw new Error('useAgentStatusContext must be used within an AgentStatus provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_LABELS: Record<AgentState, string> = {
  idle: 'Idle',
  thinking: 'Thinking...',
  acting: 'Acting...',
  waiting: 'Waiting...',
  done: 'Done',
  handoff: 'Handing off...',
};

const DOT_CONFIG: Record<
  AgentState,
  { dot: string; ping: string; text: string; icon?: React.ReactNode }
> = {
  idle: {
    dot: 'bg-muted-foreground/40',
    ping: '',
    text: 'text-muted-foreground',
  },
  thinking: {
    dot: 'bg-primary',
    ping: 'bg-primary/40',
    text: 'text-primary',
  },
  acting: {
    dot: 'bg-[var(--color-amber-400,theme(colors.amber.400))]',
    ping: 'bg-[var(--color-amber-400,theme(colors.amber.400))]/40',
    text: 'text-[var(--color-amber-400,theme(colors.amber.400))]',
    icon: <Zap className="size-3" />,
  },
  waiting: {
    dot: 'bg-[var(--color-blue-400,theme(colors.blue.400))]',
    ping: '',
    text: 'text-[var(--color-blue-400,theme(colors.blue.400))]',
    icon: <Clock className="size-3" />,
  },
  done: {
    dot: 'bg-[var(--color-emerald-400,theme(colors.emerald.400))]',
    ping: '',
    text: 'text-[var(--color-emerald-400,theme(colors.emerald.400))]',
    icon: <Check className="size-3" />,
  },
  handoff: {
    dot: 'bg-[var(--color-purple-400,theme(colors.purple.400))]',
    ping: 'bg-[var(--color-purple-400,theme(colors.purple.400))]/40',
    text: 'text-[var(--color-purple-400,theme(colors.purple.400))]',
    icon: <ArrowRight className="size-3" />,
  },
};

// ---------------------------------------------------------------------------
// Root — AgentStatus
// ---------------------------------------------------------------------------

export type AgentStatusProps = {
  status: AgentState;
  label?: string;
  handoffTo?: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function AgentStatus({
  status,
  label,
  handoffTo,
  children,
  className,
  ...props
}: AgentStatusProps) {
  const resolvedLabel =
    handoffTo && status === 'handoff'
      ? `Handing off to ${handoffTo}...`
      : (label ?? DEFAULT_LABELS[status]);

  return (
    <AgentStatusContext.Provider value={{ status, label: resolvedLabel }}>
      <div className={cn('flex items-center gap-2', className)} {...props}>
        <ClaudeIcon className="size-3.5 shrink-0 opacity-70" />
        {children}
      </div>
    </AgentStatusContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// AgentStatusDot
// ---------------------------------------------------------------------------

export type AgentStatusDotProps = {
  className?: string;
} & React.ComponentProps<'div'>;

export function AgentStatusDot({ className, ...props }: AgentStatusDotProps) {
  const { status } = useAgentStatusContext();
  const cfg = DOT_CONFIG[status];

  return (
    <div
      className={cn('relative flex size-3.5 shrink-0 items-center justify-center', className)}
      {...props}
    >
      {cfg.ping && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full',
            cfg.ping,
          )}
        />
      )}
      <span className={cn('relative inline-flex size-2 rounded-full', cfg.dot)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentStatusLabel
// ---------------------------------------------------------------------------

export type AgentStatusLabelProps = {
  className?: string;
} & React.ComponentProps<'span'>;

export function AgentStatusLabel({ className, ...props }: AgentStatusLabelProps) {
  const { status, label } = useAgentStatusContext();
  const cfg = DOT_CONFIG[status];

  return (
    <span
      className={cn('text-xs font-medium', cfg.text, className)}
      {...props}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Convenience export — pre-composed badge (backward-compatible)
// ---------------------------------------------------------------------------

export type AgentStatusBadgeProps = {
  status: AgentState;
  label?: string;
  handoffTo?: string;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function AgentStatusBadge({
  status,
  label,
  handoffTo,
  className,
  ...props
}: AgentStatusBadgeProps) {
  return (
    <AgentStatus
      status={status}
      label={label}
      handoffTo={handoffTo}
      className={className}
      {...props}
    >
      <AgentStatusDot />
      <AgentStatusLabel />
    </AgentStatus>
  );
}
