import { ClipboardList } from 'lucide-react';

interface PlanStep {
  id: string;
  label: string;
  detail?: string;
}

interface PlanCardProps {
  title: string;
  steps: PlanStep[];
  estimatedSteps?: number;
}

export function PlanCard({ title, steps, estimatedSteps }: PlanCardProps) {
  return (
    <div className="my-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-primary/70" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {estimatedSteps !== undefined && (
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            ~{estimatedSteps} steps
          </span>
        )}
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, idx) => (
          <li key={step.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold tabular-nums text-primary/80">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <span className="text-xs font-medium text-foreground">{step.label}</span>
              {step.detail && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{step.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
