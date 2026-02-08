import { X } from 'lucide-react';
import type { ImageAttachment } from '@/lib/types';

interface ImagePreviewProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-1 pb-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="group relative shrink-0 h-16 w-16 rounded-lg border border-border overflow-hidden"
        >
          <img
            src={img.dataUrl}
            alt={img.filename}
            className="h-full w-full object-cover"
          />
          <button
            onClick={() => onRemove(img.id)}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            title="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
