import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, FileText, Image as ImageIcon, File } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttachmentVariant = 'grid' | 'inline' | 'list';

type MediaCategory = 'image' | 'document' | 'unknown';

function mediaCategory(mimeType: string): MediaCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/json'
  )
    return 'document';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Context (variant flows down without prop-drilling)
// ---------------------------------------------------------------------------

const VariantCtx = createContext<AttachmentVariant>('grid');

// ---------------------------------------------------------------------------
// <Attachments variant="grid|inline|list">
// ---------------------------------------------------------------------------

interface AttachmentsProps {
  variant?: AttachmentVariant;
  children: React.ReactNode;
  className?: string;
}

const CONTAINER_CLASSES: Record<AttachmentVariant, string> = {
  grid: 'flex flex-wrap gap-2',
  inline: 'flex flex-wrap items-center gap-1.5',
  list: 'flex flex-col gap-1.5',
};

export function Attachments({
  variant = 'grid',
  children,
  className = '',
}: AttachmentsProps) {
  return (
    <VariantCtx.Provider value={variant}>
      <div className={`${CONTAINER_CLASSES[variant]} ${className}`}>
        {children}
      </div>
    </VariantCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// <Attachment> — wraps one attachment item
// ---------------------------------------------------------------------------

interface AttachmentProps {
  children: React.ReactNode;
  className?: string;
}

const ITEM_CLASSES: Record<AttachmentVariant, string> = {
  grid: 'group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30',
  inline:
    'inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
  list: 'flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2',
};

export function Attachment({ children, className = '' }: AttachmentProps) {
  const variant = useContext(VariantCtx);
  return (
    <div className={`${ITEM_CLASSES[variant]} ${className}`}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// <AttachmentPreview> — thumbnail or icon
// ---------------------------------------------------------------------------

interface AttachmentPreviewProps {
  /** Data URL or remote URL for image preview */
  src?: string;
  alt?: string;
  mimeType?: string;
}

function CategoryIcon({ category }: { category: MediaCategory }) {
  const cls = 'h-3.5 w-3.5 text-muted-foreground';
  if (category === 'image') return <ImageIcon className={cls} />;
  if (category === 'document') return <FileText className={cls} />;
  return <File className={cls} />;
}

// ---------------------------------------------------------------------------
// <ImageLightbox> — fullscreen modal for viewing images
// ---------------------------------------------------------------------------

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-4 safe-top safe-bottom"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute z-[101] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        style={{
          top: 'max(env(safe-area-inset-top, 0px) + 1rem, 1rem)',
          right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
        }}
        title="Close"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

export function AttachmentPreview({
  src,
  alt = 'attachment',
  mimeType = '',
}: AttachmentPreviewProps) {
  const variant = useContext(VariantCtx);
  const cat = mediaCategory(mimeType);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = useCallback(() => {
    if (cat === 'image' && src) setLightboxOpen(true);
  }, [cat, src]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const lightbox =
    lightboxOpen && src ? (
      <ImageLightbox src={src} alt={alt} onClose={closeLightbox} />
    ) : null;

  // Grid: full-size thumbnail
  if (variant === 'grid') {
    return cat === 'image' && src ? (
      <>
        <img
          src={src}
          alt={alt}
          className="h-full w-full cursor-pointer object-cover"
          draggable={false}
          onClick={openLightbox}
        />
        {lightbox}
      </>
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        <CategoryIcon category={cat} />
      </div>
    );
  }

  // Inline: small icon only
  if (variant === 'inline') {
    return <CategoryIcon category={cat} />;
  }

  // List: small thumbnail or icon
  return cat === 'image' && src ? (
    <>
      <img
        src={src}
        alt={alt}
        className="h-10 w-10 shrink-0 cursor-pointer rounded-md object-cover"
        draggable={false}
        onClick={openLightbox}
      />
      {lightbox}
    </>
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/50">
      <CategoryIcon category={cat} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// <AttachmentInfo> — filename and optional size
// ---------------------------------------------------------------------------

interface AttachmentInfoProps {
  filename: string;
  /** Human-readable size string, e.g. "1.2 MB" */
  size?: string;
}

export function AttachmentInfo({ filename, size }: AttachmentInfoProps) {
  const variant = useContext(VariantCtx);

  // Grid: hidden (thumbnail-only view)
  if (variant === 'grid') return null;

  // Inline: just the short name
  if (variant === 'inline') {
    const short = filename.split('/').pop() ?? filename;
    return <span className="max-w-[120px] truncate">{short}</span>;
  }

  // List: name + size stacked
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-medium text-foreground">{filename}</p>
      {size && (
        <p className="text-[10px] text-muted-foreground">{size}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// <AttachmentRemove> — X button
// ---------------------------------------------------------------------------

interface AttachmentRemoveProps {
  onRemove: () => void;
}

export function AttachmentRemove({ onRemove }: AttachmentRemoveProps) {
  const variant = useContext(VariantCtx);

  // Grid: floating top-right button
  if (variant === 'grid') {
    return (
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    );
  }

  // List: trailing X
  if (variant === 'list') {
    return (
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/50"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    );
  }

  // Inline: no remove button (read-only view in messages)
  return null;
}
