"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

const stateAccent: Record<string, string> = {
  "approval-requested": "border-l-yellow-500/60",
  "approval-responded": "border-l-blue-400/60",
  "input-available": "border-l-cyan-400/60",
  "input-streaming": "border-l-cyan-400/40",
  "output-available": "border-l-emerald-400/60",
  "output-denied": "border-l-amber-500/60",
  "output-error": "border-l-red-400/60",
};

export const Tool = ({ className, ...props }: ToolProps) => {
  const state = (props as { children?: ReactNode })?.children
    ? undefined
    : undefined;
  return (
    <Collapsible
      className={cn(
        "group not-prose mb-3 w-full overflow-hidden rounded border border-white/[0.06] bg-[#0d0d1a]/80 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
};

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "awaiting",
  "approval-responded": "responded",
  "input-available": "ready",
  "input-streaming": "streaming",
  "output-available": "done",
  "output-denied": "denied",
  "output-error": "error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3 text-yellow-500" />,
  "approval-responded": <CheckCircleIcon className="size-3 text-blue-400" />,
  "input-available": <ClockIcon className="size-3 animate-pulse text-cyan-400" />,
  "input-streaming": <CircleIcon className="size-3 text-cyan-400/60" />,
  "output-available": <CheckCircleIcon className="size-3 text-emerald-400" />,
  "output-denied": <XCircleIcon className="size-3 text-amber-500" />,
  "output-error": <XCircleIcon className="size-3 text-red-400" />,
};

const statusColors: Record<ToolPart["state"], string> = {
  "approval-requested": "text-yellow-500/80",
  "approval-responded": "text-blue-400/80",
  "input-available": "text-cyan-400/80",
  "input-streaming": "text-cyan-400/50",
  "output-available": "text-emerald-400/80",
  "output-denied": "text-amber-500/80",
  "output-error": "text-red-400/80",
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-muted-foreground">
    {statusIcons[status]}
    {statusLabels[status]}
  </span>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-3 border-l-2 px-3 py-2 text-sm transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-white/[0.05]",
        stateAccent[state] ?? "border-l-transparent",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <TerminalIcon className="size-3.5 text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground">
          {title ?? derivedName}
        </span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-3.5 text-muted-foreground/40 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-3 border-t border-white/[0.04] px-4 py-3 text-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
    <h4 className="text-xs font-medium uppercase text-muted-foreground">
      parameters
    </h4>
    <div className="rounded border border-white/[0.04] bg-black/20">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        {errorText ? "error" : "result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded border text-xs [&_table]:w-full",
          errorText
            ? "border-red-500/20 bg-red-500/5 p-3 text-red-400"
            : "border-white/[0.04] bg-black/20 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
