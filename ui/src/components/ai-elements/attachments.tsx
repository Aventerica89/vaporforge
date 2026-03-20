import type { ComponentProps, ReactNode } from 'react';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '@/lib/utils';
import { FileIcon, ImageIcon, XIcon } from 'lucide-react';
import { createContext, memo, useContext, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttachmentVariant = 'grid' | 'inline' | 'list';

export interface FileUIPart {
  type: 'file';
  name: string;
  mediaType: string;
  url?: string;
}

export interface SourceDocumentUIPart {
  type: 'source-document';
  name: string;
  mediaType: string;
  sourceId?: string;
}

export type AttachmentData = FileUIPart | SourceDocumentUIPart;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const CODE_TYPES = [
  'text/javascript', 'text/typescript', 'application/json', 'text/html',
  'text/css', 'text/xml', 'application/xml',
];

export function getMediaCategory(data: AttachmentData): 'image' | 'code' | 'document' | 'unknown' {
  const { mediaType } = data;
  if (IMAGE_TYPES.includes(mediaType)) return 'image';
  if (CODE_TYPES.includes(mediaType)) return 'code';
  if (mediaType.startsWith('text/') || mediaType === 'application/pdf') return 'document';
  return 'unknown';
}

export function getAttachmentLabel(data: AttachmentData): string {
  return data.name || 'Untitled';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AttachmentContextValue {
  data: AttachmentData;
  onRemove?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

const useAttachment = () => {
  const context = useContext(AttachmentContext);
  if (!context) {
    throw new Error('Attachment components must be used within Attachment');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Attachments — root container
// ---------------------------------------------------------------------------

export type AttachmentsProps = ComponentProps<'div'> & {
  variant?: AttachmentVariant;
};

export const Attachments = memo(
  ({ className, variant = 'inline', children, ...props }: AttachmentsProps) => (
    <div
      className={cn(
        'flex flex-wrap',
        variant === 'grid' && 'grid grid-cols-2 gap-2 sm:grid-cols-3',
        variant === 'inline' && 'flex-row gap-2',
        variant === 'list' && 'flex-col gap-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// Attachment — individual item with context
// ---------------------------------------------------------------------------

export type AttachmentProps = ComponentProps<'div'> & {
  data: AttachmentData;
  onRemove?: () => void;
  variant?: AttachmentVariant;
};

export const Attachment = memo(
  ({ className, data, onRemove, variant = 'inline', children, ...props }: AttachmentProps) => {
    const contextValue = useMemo(
      () => ({ data, onRemove, variant }),
      [data, onRemove, variant],
    );

    return (
      <AttachmentContext.Provider value={contextValue}>
        <div
          className={cn(
            'group relative flex items-center gap-2 overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:bg-muted/50',
            variant === 'grid' && 'flex-col p-2',
            variant === 'inline' && 'px-2.5 py-1.5',
            variant === 'list' && 'px-3 py-2',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </AttachmentContext.Provider>
    );
  },
);

// ---------------------------------------------------------------------------
// AttachmentPreview — media preview (image thumbnail or file icon)
// ---------------------------------------------------------------------------

export type AttachmentPreviewProps = ComponentProps<'div'>;

export const AttachmentPreview = memo(
  ({ className, ...props }: AttachmentPreviewProps) => {
    const { data, variant } = useAttachment();
    const category = getMediaCategory(data);
    const isImage = category === 'image';
    const url = 'url' in data ? data.url : undefined;

    const sizeClass = variant === 'grid' ? 'h-20 w-full' : 'h-8 w-8';

    if (isImage && url) {
      return (
        <div
          className={cn(
            'flex-shrink-0 overflow-hidden rounded-md',
            sizeClass,
            className,
          )}
          {...props}
        >
          <img
            src={url}
            alt={getAttachmentLabel(data)}
            className="h-full w-full object-cover"
          />
        </div>
      );
    }

    return (
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-md bg-muted/50',
          sizeClass,
          className,
        )}
        {...props}
      >
        {isImage ? (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        ) : (
          <FileIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// AttachmentInfo — filename + media type display
// ---------------------------------------------------------------------------

export type AttachmentInfoProps = ComponentProps<'div'> & {
  showMediaType?: boolean;
};

export const AttachmentInfo = memo(
  ({ className, showMediaType = false, ...props }: AttachmentInfoProps) => {
    const { data } = useAttachment();
    const label = getAttachmentLabel(data);

    return (
      <div className={cn('min-w-0 flex-1', className)} {...props}>
        <p className="truncate text-xs font-medium text-foreground">{label}</p>
        {showMediaType && (
          <p className="truncate text-[11px] text-muted-foreground">
            {data.mediaType}
          </p>
        )}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// AttachmentRemove — remove button
// ---------------------------------------------------------------------------

export type AttachmentRemoveProps = ComponentProps<'button'> & {
  label?: string;
};

export const AttachmentRemove = memo(
  ({ className, label, ...props }: AttachmentRemoveProps) => {
    const { onRemove } = useAttachment();
    if (!onRemove) return null;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          'flex-shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100',
          className,
        )}
        aria-label={label ?? 'Remove attachment'}
        {...props}
      >
        <XIcon className="h-3 w-3" />
      </button>
    );
  },
);

// ---------------------------------------------------------------------------
// AttachmentHoverCard — rich preview on hover
// ---------------------------------------------------------------------------

export type AttachmentHoverCardProps = ComponentProps<typeof HoverCardPrimitive.Root>;

export const AttachmentHoverCard = memo(
  ({ children, ...props }: AttachmentHoverCardProps) => (
    <HoverCardPrimitive.Root openDelay={300} closeDelay={100} {...props}>
      {children}
    </HoverCardPrimitive.Root>
  ),
);

// ---------------------------------------------------------------------------
// AttachmentHoverCardTrigger
// ---------------------------------------------------------------------------

export type AttachmentHoverCardTriggerProps = ComponentProps<typeof HoverCardPrimitive.Trigger>;

export const AttachmentHoverCardTrigger = memo(
  ({ className, children, ...props }: AttachmentHoverCardTriggerProps) => (
    <HoverCardPrimitive.Trigger asChild className={className} {...props}>
      {children}
    </HoverCardPrimitive.Trigger>
  ),
);

// ---------------------------------------------------------------------------
// AttachmentHoverCardContent — hover content
// ---------------------------------------------------------------------------

export type AttachmentHoverCardContentProps = ComponentProps<typeof HoverCardPrimitive.Content> & {
  align?: 'start' | 'center' | 'end';
};

export const AttachmentHoverCardContent = memo(
  ({ className, align = 'center', children, ...props }: AttachmentHoverCardContentProps) => (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover p-3 shadow-md',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      >
        {children}
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  ),
);

// ---------------------------------------------------------------------------
// AttachmentEmpty — empty state display
// ---------------------------------------------------------------------------

export type AttachmentEmptyProps = ComponentProps<'div'> & {
  icon?: ReactNode;
};

export const AttachmentEmpty = memo(
  ({ className, icon, children, ...props }: AttachmentEmptyProps) => (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon ?? <FileIcon className="h-8 w-8 text-muted-foreground/40" />}
      {children ?? <p>No attachments</p>}
    </div>
  ),
);

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

Attachments.displayName = 'Attachments';
Attachment.displayName = 'Attachment';
AttachmentPreview.displayName = 'AttachmentPreview';
AttachmentInfo.displayName = 'AttachmentInfo';
AttachmentRemove.displayName = 'AttachmentRemove';
AttachmentHoverCard.displayName = 'AttachmentHoverCard';
AttachmentHoverCardTrigger.displayName = 'AttachmentHoverCardTrigger';
AttachmentHoverCardContent.displayName = 'AttachmentHoverCardContent';
AttachmentEmpty.displayName = 'AttachmentEmpty';
