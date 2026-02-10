import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, Square, Paperclip, Image as ImageIcon, Loader2, Flame } from 'lucide-react';
import { filesApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';
import { haptics } from '@/lib/haptics';
import { useDebugLog } from '@/hooks/useDebugLog';
import { useCommandRegistry } from '@/hooks/useCommandRegistry';
import { useSettingsStore } from '@/hooks/useSettings';
import { useReforge } from '@/hooks/useReforge';
import { SlashCommandMenu } from '@/components/chat/SlashCommandMenu';
import { ReforgeModal } from '@/components/chat/ReforgeModal';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/attachments';
import type { ImageAttachment } from '@/lib/types';

interface PromptInputProps {
  onSubmit: (message: string, images?: ImageAttachment[]) => void;
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

  // Slash command autocomplete
  const { commands, refresh: refreshCommands } = useCommandRegistry();
  const settingsOpen = useSettingsStore((s) => s.isOpen);
  const prevSettingsOpen = useRef(settingsOpen);
  const [slashIndex, setSlashIndex] = useState(0);

  // Refresh commands when settings modal closes
  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) {
      refreshCommands();
    }
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen, refreshCommands]);

  // Detect slash prefix: "/query" with no whitespace
  const slashQuery = useMemo(() => {
    const match = input.match(/^\/(\S*)$/);
    return match ? match[1] : null;
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (slashQuery === null) return [];
    return commands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(slashQuery.toLowerCase())
    );
  }, [slashQuery, commands]);

  const slashMenuOpen = slashQuery !== null && filteredCommands.length > 0;

  // Reset index when filter changes
  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

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
    haptics.light();

    let messageText = input.trim();
    let submittedImages: ImageAttachment[] | undefined;

    // Upload images if any
    if (hasImages) {
      setIsUploading(true);
      const uploaded: ImageAttachment[] = [];

      for (const img of images) {
        try {
          const result = await filesApi.uploadBase64(
            sessionId,
            img.filename,
            img.dataUrl
          );
          if (result.success && result.data) {
            uploaded.push({ ...img, uploadedPath: result.data.path });
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
      if (uploaded.length > 0) {
        const refs = uploaded
          .map((img) => `[Image attached: ${img.uploadedPath}]`)
          .join('\n');
        messageText = messageText
          ? `${refs}\n\n${messageText}`
          : refs;
        submittedImages = uploaded;
      }
    }

    // Guard: if all uploads failed and there's no text, don't send empty prompt
    if (!messageText) {
      return;
    }

    onSubmit(messageText, submittedImages);
    setInput('');
    setImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (compact) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  // Submit a slash command: send content with a display marker
  const handleSlashSelect = useCallback(
    (cmd: (typeof commands)[number]) => {
      onSubmit(`[command:/${cmd.name}]\n${cmd.content}`);
      setInput('');
      setSlashIndex(0);
      haptics.light();
    },
    [onSubmit]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash menu keyboard navigation
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab') {
        // Tab: autocomplete the name (trailing space closes the menu)
        e.preventDefault();
        const selected = filteredCommands[slashIndex];
        if (selected) {
          setInput(`/${selected.name} `);
          setSlashIndex(0);
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter: submit the command content immediately
        e.preventDefault();
        const selected = filteredCommands[slashIndex];
        if (selected) handleSlashSelect(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
      {/* Context chips */}
      <div className="mb-1.5 flex items-center gap-1.5">
        {currentFileName && (
          <>
            <Paperclip className="h-3 w-3 text-muted-foreground/60" />
            <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {currentFileName}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => useReforge.getState().open()}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Flame className="h-3 w-3" />
          Reforge
        </button>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        {/* Slash command autocomplete */}
        {slashMenuOpen && (
          <SlashCommandMenu
            query={slashQuery ?? ''}
            commands={commands}
            selectedIndex={slashIndex}
            onSelect={handleSlashSelect}
            onDismiss={() => setInput('')}
          />
        )}

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
            className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            style={{
              fontSize: '16px',
              color: slashMenuOpen
                ? 'hsl(var(--primary))'
                : 'hsl(var(--foreground))',
            }}
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
          Enter or Cmd+Enter to send, Shift+Enter for new line
        </p>
      )}

      {/* Reforge context recovery modal */}
      <ReforgeModal
        onInsert={(text) => setInput((prev) => (prev ? prev + '\n\n' + text : text))}
      />
    </div>
  );
}
