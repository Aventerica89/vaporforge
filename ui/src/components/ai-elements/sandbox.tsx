import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, CodeIcon } from 'lucide-react';

import { STATE_CONFIG, type ToolState } from '@/lib/tool-utils';

// ---------------------------------------------------------------------------
// Sandbox — Collapsible root
// ---------------------------------------------------------------------------

export type SandboxProps = ComponentProps<typeof Collapsible>;

export const Sandbox = ({ className, ...props }: SandboxProps) => (
  <Collapsible
    className={cn(
      'my-1.5 w-full overflow-hidden rounded-lg border',
      className,
    )}
    defaultOpen
    {...props}
  />
);

// ---------------------------------------------------------------------------
// SandboxHeader — CollapsibleTrigger with title + status badge
// ---------------------------------------------------------------------------

export interface SandboxHeaderProps {
  title?: string;
  state: ToolState;
  className?: string;
}

export const SandboxHeader = ({
  className,
  title,
  state,
}: SandboxHeaderProps) => {
  const config = STATE_CONFIG[state];
  const StatusIcon = config.Icon;

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30',
        className,
      )}
    >
      <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>*>&]:rotate-90" />
      <CodeIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">
        {title ?? 'Sandbox'}
      </span>
      <span className="flex-1" />
      <span className={cn('flex items-center gap-1 text-[10px]', config.color)}>
        <StatusIcon className="h-3 w-3" />
        {config.label}
      </span>
    </CollapsibleTrigger>
  );
};

// ---------------------------------------------------------------------------
// SandboxContent — CollapsibleContent with Radix animations
// ---------------------------------------------------------------------------

export type SandboxContentProps = ComponentProps<typeof CollapsibleContent>;

export const SandboxContent = ({
  className,
  ...props
}: SandboxContentProps) => (
  <CollapsibleContent
    className={cn(
      'border-t border-border/30 text-xs',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in',
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// SandboxTabs — Tabs container
// ---------------------------------------------------------------------------

export type SandboxTabsProps = ComponentProps<typeof Tabs>;

export const SandboxTabs = ({ className, ...props }: SandboxTabsProps) => (
  <Tabs className={cn('w-full', className)} {...props} />
);

// ---------------------------------------------------------------------------
// SandboxTabsBar — horizontal bar wrapping the tab list
// ---------------------------------------------------------------------------

export type SandboxTabsBarProps = ComponentProps<'div'>;

export const SandboxTabsBar = ({
  className,
  ...props
}: SandboxTabsBarProps) => (
  <div
    className={cn(
      'flex w-full items-center border-b border-border/30',
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// SandboxTabsList — styled TabsList
// ---------------------------------------------------------------------------

export type SandboxTabsListProps = ComponentProps<typeof TabsList>;

export const SandboxTabsList = ({
  className,
  ...props
}: SandboxTabsListProps) => (
  <TabsList
    className={cn(
      'h-auto rounded-none border-0 bg-transparent p-0',
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// SandboxTabsTrigger — underline-style tab trigger
// ---------------------------------------------------------------------------

export type SandboxTabsTriggerProps = ComponentProps<typeof TabsTrigger>;

export const SandboxTabsTrigger = ({
  className,
  ...props
}: SandboxTabsTriggerProps) => (
  <TabsTrigger
    className={cn(
      'rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors',
      'data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// SandboxTabContent — individual tab panel
// ---------------------------------------------------------------------------

export type SandboxTabContentProps = ComponentProps<typeof TabsContent>;

export const SandboxTabContent = ({
  className,
  ...props
}: SandboxTabContentProps) => (
  <TabsContent className={cn('mt-0 text-sm', className)} {...props} />
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Sandbox.displayName = 'Sandbox';
SandboxHeader.displayName = 'SandboxHeader';
SandboxContent.displayName = 'SandboxContent';
SandboxTabs.displayName = 'SandboxTabs';
SandboxTabsBar.displayName = 'SandboxTabsBar';
SandboxTabsList.displayName = 'SandboxTabsList';
SandboxTabsTrigger.displayName = 'SandboxTabsTrigger';
SandboxTabContent.displayName = 'SandboxTabContent';
