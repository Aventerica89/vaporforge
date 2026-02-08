import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Paperclip, Image as ImageIcon, Loader2 } from 'lucide-react';
import { filesApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useDebugLog } from '@/hooks/useDebugLog';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/attachments';
import type { ImageAttachment } from '@/lib/types';

interface PromptInputProps {
  onSubmit: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming?: () => void;
  currentFileName?: string;
  /** Mobile compact mode — adds safe-bottom padding */
  compact?: boolean;
  /** When true, keyboard is open — suppresses safe-bottom padding */
  keyboardOpen?: boolean;
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 24;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[mime] || 'png';
}

export function PromptInput({
  onSubmit,
  isStreaming,
  onStopStreaming,
  currentFileName,
  compact = false,
  keyboardOpen = false,
}: PromptInputProps) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useSandboxStore((s) => s.currentSession?.id);

  // Auto-resize textarea based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  // Reset any residual scroll from iOS keyboard dismiss
  const handleBlur = useCallback(() => {
    if (!compact) return;
    setTimeout(() => window.scrollTo(0, 0), 100);
  }, [compact]);

  const addImageFromFile = useCallback((file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) return;
    if (file.size > MAX_IMAGE_BYTES) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const ext = mimeToExt(file.type);
      const attachment: ImageAttachment = {
        id: crypto.randomUUID(),
        filename: `${crypto.randomUUID().slice(0, 8)}.${ext}`,
        mimeType: file.type,
        dataUrl,
      };
      setImages((prev) =>
        prev.length >= MAX_IMAGES ? prev : [...prev, attachment]
      );
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImageFromFile(file);
          return;
        }
      }
    },
    [addImageFromFile]
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    const hasImages = images.length > 0;
    if ((!hasText && !hasImages) || isStreaming || !sessionId) return;

    let messageText = input.trim();

    // Upload images if any
    if (hasImages) {
      setIsUploading(true);
      const uploadedPaths: string[] = [];

      for (const img of images) {
        try {
          const result = await filesApi.uploadBase64(
            sessionId,
            img.filename,
            img.dataUrl
          );
          if (result.success && result.data) {
            uploadedPaths.push(result.data.path);
          }
        } catch (err) {
          useDebugLog.getState().addEntry({
            category: 'api',
            level: 'error',
            summary: `Image upload failed: ${img.filename}`,
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setIsUploading(false);

      // Prepend image references to the prompt
      if (uploadedPaths.length > 0) {
        const refs = uploadedPaths
          .map((p) => `[Image attached: ${p}]`)
          .join('\n');
        messageText = messageText
          ? `${refs}\n\n${messageText}`
          : refs;
      }
    }

    // Guard: if all uploads failed and there's no text, don't send empty prompt
    if (!messageText) {
      return;
    }

    onSubmit(messageText);
    setInput('');
    setImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (compact) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStop = () => {
    if (onStopStreaming) {
      onStopStreaming();
    }
  };

  const hasInput = input.trim().length > 0 || images.length > 0;

  return (
    <div
      ref={containerRef}
      className={`border-t border-border/60 px-4 pb-3 pt-2 ${
        compact && !keyboardOpen ? 'safe-bottom' : ''
      }`}
    >
      {/* Context chip */}
      {currentFileName && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Paperclip className="h-3 w-3 text-muted-foreground/60" />
          <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {currentFileName}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <div className="relative rounded-xl border border-border/60 bg-background transition-colors focus-within:border-primary/50 focus-within:shadow-[0_0_12px_-4px_hsl(var(--primary)/0.2)]">
          {/* Image preview strip — AI Elements grid variant */}
          {images.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <Attachments variant="grid">
                {images.map((img) => (
                  <Attachment key={img.id}>
                    <AttachmentPreview
                      src={img.dataUrl}
                      alt={img.filename}
                      mimeType={img.mimeType}
                    />
                    <AttachmentRemove onRemove={() => removeImage(img.id)} />
                  </Attachment>
                ))}
              </Attachments>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={
              images.length > 0
                ? 'Add a message about the image(s)...'
                : 'Message Claude...'
            }
            rows={1}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            style={{ color: 'hsl(var(--foreground))' }}
          />

          {/* Action buttons */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {/* Image count indicator */}
            {images.length > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <ImageIcon className="h-3 w-3" />
                {images.length}
              </span>
            )}

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : isUploading ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <button
                type="submit"
                disabled={!hasInput}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  hasInput
                    ? 'bg-primary text-primary-foreground shadow-[0_0_8px_-2px_hsl(var(--primary)/0.4)]'
                    : 'bg-muted/50 text-muted-foreground/40'
                }`}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {!compact && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Enter to send, Shift+Enter for new line, Paste images
        </p>
      )}
    </div>
  );
}
