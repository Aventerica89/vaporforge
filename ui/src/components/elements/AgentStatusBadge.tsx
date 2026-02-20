import { Check, Zap, Clock, ArrowRight } from 'lucide-react';
import { ClaudeIcon } from '@/components/icons/ClaudeIcon';

export type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'done' | 'handoff';

interface AgentStatusBadgeProps {
  status: AgentState;
  label?: string;
  handoffTo?: string;
  className?: string;
}

const STATUS_CONFIG: Record<AgentState, {
  dot: string;
  ping: string;
  text: string;
  icon?: React.ReactNode;
}> = {
  idle: {
    dot: 'bg-muted-foreground/40',
    ping: '',
    text: 'text-muted-foreground',
  },
  thinking: {
    dot: 'bg-primary',
    ping: 'animate-ping bg-primary/40',
    text: 'text-primary',
  },
  acting: {
    dot: 'bg-amber-400',
    ping: 'animate-ping bg-amber-400/40',
    text: 'text-amber-400',
    icon: <Zap className="h-3 w-3" />,
  },
  waiting: {
    dot: 'bg-blue-400',
    ping: '',
    text: 'text-blue-400',
    icon: <Clock className="h-3 w-3" />,
  },
  done: {
    dot: 'bg-emerald-400',
    ping: '',
    text: 'text-emerald-400',
    icon: <Check className="h-3 w-3" />,
  },
  handoff: {
    dot: 'bg-purple-400',
    ping: 'animate-ping bg-purple-400/40',
    text: 'text-purple-400',
    icon: <ArrowRight className="h-3 w-3" />,
  },
};

export function AgentStatusBadge({ status, label, handoffTo, className = '' }: AgentStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];

  const displayLabel =
    handoffTo && status === 'handoff'
      ? `Handing off to ${handoffTo}...`
      : label ?? {
          idle: 'Idle',
          thinking: 'Thinking...',
          acting: 'Acting...',
          waiting: 'Waiting...',
          done: 'Done',
          handoff: 'Handing off...',
        }[status];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Agent icon */}
      <ClaudeIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />

      {/* Animated dot */}
      <div className="relative flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        {cfg.ping && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.ping}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`} />
      </div>

      {/* Label */}
      <span className={`text-xs font-medium ${cfg.text}`}>{displayLabel}</span>
    </div>
  );
}
