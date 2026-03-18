import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, ClipboardListIcon } from 'lucide-react';
import { createContext, memo, useContext, useMemo } from 'react';

import { Shimmer } from '@/components/ai-elements/Shimmer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanStepData = {
  id: string;
  label: string;
  detail?: string;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PlanContextValue {
  title: string;
  isStreaming: boolean;
  estimatedSteps?: number;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('Plan components must be used within Plan');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Plan — Collapsible root + context provider
// ---------------------------------------------------------------------------

export type PlanProps = ComponentProps<typeof Collapsible> & {
  title: string;
  isStreaming?: boolean;
  estimatedSteps?: number;
};

export const Plan = memo(
  ({
    className,
    title,
    isStreaming = false,
    estimatedSteps,
    children,
    ...props
  }: PlanProps) => {
    const contextValue = useMemo(
      () => ({ title, isStreaming, estimatedSteps }),
      [title, isStreaming, estimatedSteps],
    );

    return (
      <PlanContext.Provider value={contextValue}>
        <Collapsible
          defaultOpen
          className={cn(
            'my-1.5 overflow-hidden rounded-lg border transition-all duration-200',
            isStreaming
              ? 'border-primary/50 shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]'
              : 'border-primary/20',
            className,
          )}
          {...props}
        >
          {children}
        </Collapsible>
      </PlanContext.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// PlanHeader — CollapsibleTrigger with icon, title, step count
// ---------------------------------------------------------------------------

export type PlanHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanHeader = memo(
  ({ className, ...props }: PlanHeaderProps) => {
    const { title, isStreaming, estimatedSteps } = usePlan();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10/30',
          className,
        )}
        {...props}
      >
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />

        <ClipboardListIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />

        {isStreaming ? (
          <Shimmer as="span" className="text-sm font-semibold" duration={1.5}>
            {title}
          </Shimmer>
        ) : (
          <span className="text-sm font-semibold text-foreground">{title}</span>
        )}

        <span className="flex-1" />

        {estimatedSteps != null && (
          <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
            ~{estimatedSteps} steps
          </span>
        )}

        {isStreaming && (
          <div className="h-1.5 w-8 overflow-hidden rounded-full">
            <div className="skeleton h-full w-full" />
          </div>
        )}
      </CollapsibleTrigger>
    );
  },
);

// ---------------------------------------------------------------------------
// PlanContent — CollapsibleContent with Radix animations
// ---------------------------------------------------------------------------

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export const PlanContent = memo(
  ({ className, children, ...props }: PlanContentProps) => (
    <CollapsibleContent
      className={cn(
        'border-t border-primary/10 text-xs',
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
// PlanSteps — ordered list container
// ---------------------------------------------------------------------------

export type PlanStepsProps = ComponentProps<'ol'>;

export const PlanSteps = memo(
  ({ className, children, ...props }: PlanStepsProps) => (
    <ol className={cn('space-y-1.5', className)} {...props}>
      {children}
    </ol>
  ),
);

// ---------------------------------------------------------------------------
// PlanStep — individual numbered step
// ---------------------------------------------------------------------------

export type PlanStepProps = ComponentProps<'li'> & {
  index: number;
  label: string;
  detail?: string;
};

export const PlanStep = memo(
  ({ index, label, detail, className, ...props }: PlanStepProps) => (
    <li className={cn('flex gap-2.5', className)} {...props}>
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          'bg-primary/15 text-[10px] font-bold tabular-nums text-primary/80',
        )}
      >
        {index}
      </span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {detail && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </li>
  ),
);

// ---------------------------------------------------------------------------
// PlanCard — convenience wrapper (backward compatible)
// ---------------------------------------------------------------------------

export function PlanCard({
  title,
  steps,
  estimatedSteps,
  isStreaming,
  className,
}: {
  title: string;
  steps: PlanStepData[];
  estimatedSteps?: number;
  isStreaming?: boolean;
  className?: string;
}) {
  return (
    <Plan title={title} isStreaming={isStreaming} estimatedSteps={estimatedSteps} className={className}>
      <PlanHeader />
      <PlanContent>
        <PlanSteps>
          {steps.map((step, idx) => (
            <PlanStep key={step.id} index={idx + 1} label={step.label} detail={step.detail} />
          ))}
        </PlanSteps>
      </PlanContent>
    </Plan>
  );
}

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Plan.displayName = 'Plan';
PlanHeader.displayName = 'PlanHeader';
PlanContent.displayName = 'PlanContent';
PlanSteps.displayName = 'PlanSteps';
PlanStep.displayName = 'PlanStep';
