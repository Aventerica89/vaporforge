import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BotIcon, ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';

import { CodeBlock } from './code-block';

// ---------------------------------------------------------------------------
// Agent — root container
// ---------------------------------------------------------------------------

export type AgentProps = ComponentProps<'div'>;

export const Agent = memo(({ className, ...props }: AgentProps) => (
  <div className={cn('flex flex-col gap-4', className)} {...props} />
));

// ---------------------------------------------------------------------------
// AgentHeader — name + optional model badge
// ---------------------------------------------------------------------------

export type AgentHeaderProps = ComponentProps<'div'> & {
  name: string;
  model?: string;
};

export const AgentHeader = memo(
  ({ className, name, model, ...props }: AgentHeaderProps) => (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <BotIcon className="size-5 text-muted-foreground" />
      <span className="font-semibold text-sm">{name}</span>
      {model && <Badge variant="secondary">{model}</Badge>}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// AgentContent — body container
// ---------------------------------------------------------------------------

export type AgentContentProps = ComponentProps<'div'>;

export const AgentContent = memo(
  ({ className, ...props }: AgentContentProps) => (
    <div className={cn('flex flex-col gap-4', className)} {...props} />
  ),
);

// ---------------------------------------------------------------------------
// AgentInstructions — collapsible text block
// ---------------------------------------------------------------------------

export type AgentInstructionsProps = ComponentProps<typeof Collapsible> & {
  children: string;
};

export const AgentInstructions = memo(
  ({ className, children, ...props }: AgentInstructionsProps) => (
    <Collapsible className={cn('border-b', className)} {...props}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-3 text-sm font-medium">
        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
        Instructions
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in">
        <p className="pb-3 text-sm text-muted-foreground">{children}</p>
      </CollapsibleContent>
    </Collapsible>
  ),
);

// ---------------------------------------------------------------------------
// AgentTools — collapsible tools list
// ---------------------------------------------------------------------------

export type AgentToolsProps = ComponentProps<typeof Collapsible>;

export const AgentTools = memo(
  ({ className, children, ...props }: AgentToolsProps) => (
    <Collapsible className={cn('border-b', className)} {...props}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-3 text-sm font-medium">
        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
        Tools
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="space-y-2 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  ),
);

// ---------------------------------------------------------------------------
// AgentTool — individual tool with name, description, and schema
// ---------------------------------------------------------------------------

export type AgentToolProps = ComponentProps<typeof Collapsible> & {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
};

export const AgentTool = memo(
  ({ className, name, description, schema, ...props }: AgentToolProps) => (
    <Collapsible className={cn('rounded-md border', className)} {...props}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium">
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0 transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
        <span className="font-mono">{name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="flex flex-col gap-3 border-t px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {description ?? 'No description'}
          </p>
          {schema && (
            <CodeBlock language="json" code={JSON.stringify(schema, null, 2)} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
);

// ---------------------------------------------------------------------------
// AgentOutput — collapsible output schema display
// ---------------------------------------------------------------------------

export type AgentOutputProps = ComponentProps<typeof Collapsible> & {
  schema: string;
};

export const AgentOutput = memo(
  ({ className, schema, ...props }: AgentOutputProps) => (
    <Collapsible className={cn('border-b', className)} {...props}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-3 text-sm font-medium">
        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
        Output Schema
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="pb-3">
          <CodeBlock language="json" code={schema} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Agent.displayName = 'Agent';
AgentHeader.displayName = 'AgentHeader';
AgentContent.displayName = 'AgentContent';
AgentInstructions.displayName = 'AgentInstructions';
AgentTools.displayName = 'AgentTools';
AgentTool.displayName = 'AgentTool';
AgentOutput.displayName = 'AgentOutput';
