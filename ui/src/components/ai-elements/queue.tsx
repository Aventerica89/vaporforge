import type { ComponentProps, ReactNode } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CircleIcon,
  FileIcon,
  ImageIcon,
} from 'lucide-react';
import { createContext, memo, useContext, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Context — section-level state
// ---------------------------------------------------------------------------

interface QueueSectionContextValue {
  isOpen: boolean;
}

const QueueSectionContext = createContext<QueueSectionContextValue | null>(null);

const useQueueSection = () => {
  const context = useContext(QueueSectionContext);
  if (!context) {
    throw new Error('QueueSection components must be used within QueueSection');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Queue — root container
// ---------------------------------------------------------------------------

export type QueueProps = ComponentProps<'div'>;

export const Queue = memo(
  ({ className, children, ...props }: QueueProps) => (
    <div
      className={cn(
        'my-1.5 overflow-hidden rounded-lg border border-border/60',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// QueueSection — collapsible section
// ---------------------------------------------------------------------------

export type QueueSectionProps = ComponentProps<typeof Collapsible> & {
  defaultOpen?: boolean;
};

export const QueueSection = memo(
  ({ className, defaultOpen = true, children, ...props }: QueueSectionProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const contextValue = useMemo(() => ({ isOpen }), [isOpen]);

    return (
      <QueueSectionContext.Provider value={contextValue}>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className={cn('border-b border-border/30 last:border-b-0', className)}
          {...props}
        >
          {children}
        </Collapsible>
      </QueueSectionContext.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// QueueSectionTrigger — section header trigger
// ---------------------------------------------------------------------------

export type QueueSectionTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const QueueSectionTrigger = memo(
  ({ className, children, ...props }: QueueSectionTriggerProps) => {
    const { isOpen } = useQueueSection();

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
        {children}
      </CollapsibleTrigger>
    );
  },
);

// ---------------------------------------------------------------------------
// QueueSectionLabel — label with optional count and icon
// ---------------------------------------------------------------------------

export type QueueSectionLabelProps = ComponentProps<'span'> & {
  label: string;
  count?: number;
  icon?: ReactNode;
};

export const QueueSectionLabel = memo(
  ({ className, label, count, icon, ...props }: QueueSectionLabelProps) => (
    <span
      className={cn('flex items-center gap-1.5 text-xs', className)}
      {...props}
    >
      {icon}
      <span className="font-medium text-foreground">{label}</span>
      {count != null && (
        <span className="text-muted-foreground">({count})</span>
      )}
    </span>
  ),
);

// ---------------------------------------------------------------------------
// QueueSectionContent — collapsible content
// ---------------------------------------------------------------------------

export type QueueSectionContentProps = ComponentProps<typeof CollapsibleContent>;

export const QueueSectionContent = memo(
  ({ className, children, ...props }: QueueSectionContentProps) => (
    <CollapsibleContent
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  ),
);

// ---------------------------------------------------------------------------
// QueueList — scrollable list
// ---------------------------------------------------------------------------

export type QueueListProps = ComponentProps<'ul'> & {
  maxHeight?: string;
};

export const QueueList = memo(
  ({ className, maxHeight = '300px', children, ...props }: QueueListProps) => (
    <ScrollArea style={{ maxHeight }} className="w-full">
      <ul
        className={cn('space-y-0.5 px-3 pb-2', className)}
        {...props}
      >
        {children}
      </ul>
    </ScrollArea>
  ),
);

// ---------------------------------------------------------------------------
// QueueItem — list item
// ---------------------------------------------------------------------------

export type QueueItemProps = ComponentProps<'li'>;

export const QueueItem = memo(
  ({ className, children, ...props }: QueueItemProps) => (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/50',
        className,
      )}
      {...props}
    >
      {children}
    </li>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemIndicator — status marker
// ---------------------------------------------------------------------------

export type QueueItemIndicatorProps = ComponentProps<'span'> & {
  completed?: boolean;
};

export const QueueItemIndicator = memo(
  ({ className, completed = false, ...props }: QueueItemIndicatorProps) => (
    <span className={cn('mt-0.5 flex-shrink-0', className)} {...props}>
      {completed ? (
        <CheckCircleIcon className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <CircleIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </span>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemContent — text content with optional strikethrough
// ---------------------------------------------------------------------------

export type QueueItemContentProps = ComponentProps<'span'> & {
  completed?: boolean;
};

export const QueueItemContent = memo(
  ({ className, completed = false, children, ...props }: QueueItemContentProps) => (
    <span
      className={cn(
        'flex-1 text-xs',
        completed ? 'text-muted-foreground line-through' : 'text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemDescription — description text
// ---------------------------------------------------------------------------

export type QueueItemDescriptionProps = ComponentProps<'p'> & {
  completed?: boolean;
};

export const QueueItemDescription = memo(
  ({ className, completed = false, children, ...props }: QueueItemDescriptionProps) => (
    <p
      className={cn(
        'mt-0.5 text-[11px] leading-snug',
        completed ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemActions — action button container
// ---------------------------------------------------------------------------

export type QueueItemActionsProps = ComponentProps<'div'>;

export const QueueItemActions = memo(
  ({ className, children, ...props }: QueueItemActionsProps) => (
    <div
      className={cn('flex flex-shrink-0 items-center gap-1', className)}
      {...props}
    >
      {children}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemAction — individual action button
// ---------------------------------------------------------------------------

export type QueueItemActionProps = ComponentProps<'button'>;

export const QueueItemAction = memo(
  ({ className, children, ...props }: QueueItemActionProps) => (
    <button
      type="button"
      className={cn(
        'rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemAttachment — inline attachment display
// ---------------------------------------------------------------------------

export type QueueItemAttachmentProps = ComponentProps<'div'> & {
  filename: string;
};

export const QueueItemAttachment = memo(
  ({ className, filename, children, ...props }: QueueItemAttachmentProps) => (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground',
        className,
      )}
      {...props}
    >
      <FileIcon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{filename}</span>
      {children}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemImage — inline image display
// ---------------------------------------------------------------------------

export type QueueItemImageProps = ComponentProps<'div'> & {
  src: string;
  alt?: string;
};

export const QueueItemImage = memo(
  ({ className, src, alt = '', ...props }: QueueItemImageProps) => (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border/30',
        className,
      )}
      {...props}
    >
      <img
        src={src}
        alt={alt}
        className="h-16 w-16 object-cover"
      />
    </div>
  ),
);

// ---------------------------------------------------------------------------
// QueueItemFile — inline file display
// ---------------------------------------------------------------------------

export type QueueItemFileProps = ComponentProps<'div'> & {
  filename: string;
  icon?: ReactNode;
};

export const QueueItemFile = memo(
  ({ className, filename, icon, ...props }: QueueItemFileProps) => (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon ?? <ImageIcon className="h-3 w-3 flex-shrink-0" />}
      <span className="truncate">{filename}</span>
    </div>
  ),
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Queue.displayName = 'Queue';
QueueSection.displayName = 'QueueSection';
QueueSectionTrigger.displayName = 'QueueSectionTrigger';
QueueSectionLabel.displayName = 'QueueSectionLabel';
QueueSectionContent.displayName = 'QueueSectionContent';
QueueList.displayName = 'QueueList';
QueueItem.displayName = 'QueueItem';
QueueItemIndicator.displayName = 'QueueItemIndicator';
QueueItemContent.displayName = 'QueueItemContent';
QueueItemDescription.displayName = 'QueueItemDescription';
QueueItemActions.displayName = 'QueueItemActions';
QueueItemAction.displayName = 'QueueItemAction';
QueueItemAttachment.displayName = 'QueueItemAttachment';
QueueItemImage.displayName = 'QueueItemImage';
QueueItemFile.displayName = 'QueueItemFile';
