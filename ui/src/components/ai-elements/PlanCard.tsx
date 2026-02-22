import { cn } from '@/lib/cn';
import { ClipboardList } from 'lucide-react';
import React, { createContext, useContext } from 'react';

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

type PlanContextType = {
  title: string;
  estimatedSteps?: number;
};

const PlanContext = createContext<PlanContextType | undefined>(undefined);

function usePlanContext() {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlanContext must be used within a Plan provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root — Plan
// ---------------------------------------------------------------------------

export type PlanProps = {
  title: string;
  estimatedSteps?: number;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function Plan({ title, estimatedSteps, children, className, ...props }: PlanProps) {
  return (
    <PlanContext.Provider value={{ title, estimatedSteps }}>
      <div
        className={cn(
          'my-1 rounded-lg border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/5 p-3',
          className,
        )}
        {...props}
      >
        <div className="mb-2.5 flex items-center gap-2">
          <ClipboardList className="size-4 shrink-0 text-[color:var(--primary)]/70" />
          <span className="text-sm font-semibold text-[color:var(--foreground)]">{title}</span>
          {estimatedSteps !== undefined && (
            <span className="ml-auto text-[10px] tabular-nums text-[color:var(--muted-foreground)]">
              ~{estimatedSteps} steps
            </span>
          )}
        </div>
        {children}
      </div>
    </PlanContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// PlanSteps — ordered list container
// ---------------------------------------------------------------------------

export type PlanStepsProps = {
  children?: React.ReactNode;
  className?: string;
} & React.ComponentProps<'ol'>;

export function PlanSteps({ children, className, ...props }: PlanStepsProps) {
  // Consume context to assert correct nesting (throws if outside Plan)
  usePlanContext();
  return (
    <ol className={cn('space-y-1.5', className)} {...props}>
      {children}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// PlanStep — individual numbered step
// ---------------------------------------------------------------------------

export type PlanStepProps = {
  index: number;
  label: string;
  detail?: string;
  className?: string;
} & Omit<React.ComponentProps<'li'>, 'children'>;

export function PlanStep({ index, label, detail, className, ...props }: PlanStepProps) {
  return (
    <li className={cn('flex gap-2.5', className)} {...props}>
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          'bg-[color:var(--primary)]/15 text-[10px] font-bold tabular-nums text-[color:var(--primary)]/80',
        )}
      >
        {index}
      </span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-[color:var(--foreground)]">{label}</span>
        {detail && (
          <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
            {detail}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// PlanCard — backward-compatible convenience wrapper
// ---------------------------------------------------------------------------

export function PlanCard({ title, steps, estimatedSteps, className }: {
  title: string;
  steps: PlanStepData[];
  estimatedSteps?: number;
  className?: string;
}) {
  return (
    <Plan title={title} estimatedSteps={estimatedSteps} className={className}>
      <PlanSteps>
        {steps.map((step, idx) => (
          <PlanStep key={step.id} index={idx + 1} label={step.label} detail={step.detail} />
        ))}
      </PlanSteps>
    </Plan>
  );
}
