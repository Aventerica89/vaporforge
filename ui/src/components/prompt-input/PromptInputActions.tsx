import { useRef, useCallback } from 'react';
import { Paperclip, Image as ImageIcon } from 'lucide-react';
import { usePromptInput } from './context';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

export function PromptInputActions() {
  const { images, addImage } = usePromptInput();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        addImage(file);
      }
      // Reset so same file can be re-selected
      e.target.value = '';
    },
    [addImage],
  );

  return (
    <>
      {images.length > 0 && (
        <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <ImageIcon className="h-3 w-3" />
          {images.length}
        </span>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
        title="Attach image"
      >
        <Paperclip className="h-4 w-4" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
