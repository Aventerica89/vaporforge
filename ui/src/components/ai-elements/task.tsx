import type { ComponentProps } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, FileIcon, ListChecksIcon } from 'lucide-react';
import { createContext, memo, useContext, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TaskContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('Task components must be used within Task');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Task — Collapsible root + context provider
// ---------------------------------------------------------------------------

export type TaskProps = ComponentProps<typeof Collapsible> & {
  defaultOpen?: boolean;
};

export const Task = memo(
  ({ className, defaultOpen = false, children, ...props }: TaskProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const contextValue = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen],
    );

    return (
      <TaskContext.Provider value={contextValue}>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className={cn(
            'my-1.5 overflow-hidden rounded-lg border border-border/60 transition-all duration-200',
            className,
          )}
          {...props}
        >
          {children}
        </Collapsible>
      </TaskContext.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// TaskTrigger — Header with title
// ---------------------------------------------------------------------------

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = memo(
  ({ className, title, children, ...props }: TaskTriggerProps) => {
    const { isOpen } = useTask();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
          className,
        )}
        {...props}
      >
        <ChevronRightIcon
          className={cn(
            'h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-90',
          )}
        />

        <ListChecksIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

        <span className="text-sm font-medium text-foreground">{title}</span>

        <span className="flex-1" />

        {children}
      </CollapsibleTrigger>
    );
  },
);

// ---------------------------------------------------------------------------
// TaskContent — Collapsible body
// ---------------------------------------------------------------------------

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = memo(
  ({ className, children, ...props }: TaskContentProps) => (
    <CollapsibleContent
      className={cn(
        'border-t border-border/30 text-xs',
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
// TaskItem — List item container
// ---------------------------------------------------------------------------

export type TaskItemProps = ComponentProps<'li'>;

export const TaskItem = memo(
  ({ className, children, ...props }: TaskItemProps) => (
    <li
      className={cn('flex items-start gap-2 py-1', className)}
      {...props}
    >
      {children}
    </li>
  ),
);

// ---------------------------------------------------------------------------
// TaskItemFile — File reference display
// ---------------------------------------------------------------------------

export type TaskItemFileProps = ComponentProps<'div'> & {
  filename: string;
  line?: number;
};

export const TaskItemFile = memo(
  ({ className, filename, line, ...props }: TaskItemFileProps) => (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground',
        className,
      )}
      {...props}
    >
      <FileIcon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{filename}</span>
      {line != null && (
        <span className="text-muted-foreground/60">:{line}</span>
      )}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Task.displayName = 'Task';
TaskTrigger.displayName = 'TaskTrigger';
TaskContent.displayName = 'TaskContent';
TaskItem.displayName = 'TaskItem';
TaskItemFile.displayName = 'TaskItemFile';
