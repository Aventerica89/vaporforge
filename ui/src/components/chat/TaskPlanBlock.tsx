import { useState, useRef } from 'react';
import {
  Check,
  ChevronRight,
  Circle,
  Clock,
  AlertCircle,
  ListChecks,
  Search,
  Code2,
  TestTube2,
  GitCommitHorizontal,
  Terminal,
} from 'lucide-react';
import type { TaskPlan, TaskStep } from '@/lib/types';

interface TaskPlanBlockProps {
  plan: TaskPlan;
  isStreaming?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const PHASE_ICONS: Record<string, typeof Search> = {
  Exploring: Search,
  Implementing: Code2,
  Testing: TestTube2,
  Committing: GitCommitHorizontal,
  'Running commands': Terminal,
};

function StepStatusIcon({ status }: { status: TaskStep['status'] }) {
  if (status === 'complete') {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20">
        <Check className="h-3 w-3 text-success" />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
        <div className="relative h-3 w-3 rounded-full bg-primary" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-error/20">
        <AlertCircle className="h-3 w-3 text-error" />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center">
      <Circle className="h-3 w-3 text-muted-foreground/40" />
    </div>
  );
}

function PlanStepItem({ step, isLast }: { step: TaskStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const PhaseIcon = PHASE_ICONS[step.label] || Terminal;
  const hasDetails = step.filePaths.length > 0 || step.toolNames.length > 1;

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      {!isLast && (
        <div
          className={`absolute left-[9px] top-6 bottom-0 w-px ${
            step.status === 'active' ? 'bg-primary/40' : 'bg-border/40'
          }`}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0 pt-0.5">
        <StepStatusIcon status={step.status} />
      </div>

      {/* Step content */}
      <div className="min-w-0 flex-1 pb-3">
        <button
          onClick={() => hasDetails && setExpanded((prev) => !prev)}
          className={`flex w-full items-center gap-2 text-left text-xs ${
            hasDetails ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {hasDetails && (
            <ChevronRight
              className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          )}

          <PhaseIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" />

          <span
            className={`font-medium ${
              step.status === 'pending'
                ? 'text-muted-foreground/50'
                : 'text-foreground'
            }`}
          >
            {step.label}
          </span>

          {/* File count badge */}
          {step.filePaths.length > 0 && (
            <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground/60">
              {step.filePaths.length} {step.filePaths.length === 1 ? 'file' : 'files'}
            </span>
          )}

          <span className="flex-1" />

          {/* Duration */}
          {step.status === 'complete' && step.duration != null && (
            <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/60">
              <Clock className="h-2.5 w-2.5" />
              {formatDuration(step.duration)}
            </span>
          )}

          {/* Active shimmer */}
          {step.status === 'active' && (
            <div className="ml-1 h-1.5 w-10 overflow-hidden rounded-full">
              <div className="skeleton h-full w-full" />
            </div>
          )}
        </button>

        {/* Expandable details */}
        {hasDetails && (
          <div
            ref={contentRef}
            className="transition-all duration-200 ease-out"
            style={{
              maxHeight: expanded
                ? `${(contentRef.current?.scrollHeight || 200) + 16}px`
                : '0px',
              opacity: expanded ? 1 : 0,
              overflow: 'hidden',
            }}
          >
            <div className="mt-2 space-y-1.5">
              {/* Tool names */}
              {step.toolNames.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {step.toolNames.map((name, i) => (
                    <span
                      key={i}
                      className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}

              {/* File paths */}
              {step.filePaths.length > 0 && (
                <div className="space-y-0.5">
                  {step.filePaths.slice(0, 8).map((fp, i) => (
                    <div
                      key={i}
                      className="truncate text-[10px] font-mono text-muted-foreground/70"
                      title={fp}
                    >
                      {fp}
                    </div>
                  ))}
                  {step.filePaths.length > 8 && (
                    <div className="text-[10px] text-muted-foreground/50">
                      +{step.filePaths.length - 8} more
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskPlanBlock({ plan, isStreaming = false }: TaskPlanBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const completeCount = plan.steps.filter((s) => s.status === 'complete').length;
  const totalSteps = plan.steps.length;

  return (
    <div className="my-2">
      {/* Header */}
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
            collapsed ? '' : 'rotate-90'
          }`}
        />

        {isStreaming ? (
          <div className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary/30" />
            <ListChecks className="relative h-3.5 w-3.5 text-secondary" />
          </div>
        ) : (
          <ListChecks className="h-3.5 w-3.5 text-secondary/60" />
        )}

        <span className="font-medium text-muted-foreground">
          {isStreaming ? 'Working...' : 'Task summary'}
        </span>

        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          {completeCount}/{totalSteps} steps
        </span>

        {plan.totalDuration != null && !isStreaming && (
          <span className="text-[10px] tabular-nums text-muted-foreground/40">
            {formatDuration(plan.totalDuration)}
          </span>
        )}
      </button>

      {/* Steps timeline */}
      <div
        ref={contentRef}
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: collapsed
            ? '0px'
            : `${(contentRef.current?.scrollHeight || 600) + 16}px`,
          opacity: collapsed ? 0 : 1,
          overflow: 'hidden',
        }}
      >
        <div className="ml-4 mt-2">
          {plan.steps.map((step, i) => (
            <PlanStepItem
              key={step.id}
              step={step}
              isLast={i === plan.steps.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
