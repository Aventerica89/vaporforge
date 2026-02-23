import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { PromptInputProvider, type PromptInputStatus } from './context';
import { useCommandRegistry, type CommandEntry } from '@/hooks/useCommandRegistry';
import { useSettingsStore } from '@/hooks/useSettings';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { ImageAttachment } from '@/lib/types';

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
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

interface PromptInputRootProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (message: string, images?: ImageAttachment[]) => void;
  status: PromptInputStatus;
  onStop?: () => void;
  uploadImage?: (img: ImageAttachment) => Promise<ImageAttachment | null>;
  compact?: boolean;
  keyboardOpen?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function PromptInput({
  input,
  onInputChange,
  onSubmit,
  status,
  onStop,
  uploadImage,
  compact = false,
  keyboardOpen = false,
  disabled = false,
  children,
  className,
}: PromptInputRootProps) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // -- Command / agent autocomplete --
  const { commands, refresh: refreshCommands } = useCommandRegistry();
  const settingsOpen = useSettingsStore((s) => s.isOpen);
  const prevSettingsOpen = useRef(settingsOpen);
  const [menuIndex, setMenuIndex] = useState(0);

  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) {
      refreshCommands();
    }
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen, refreshCommands]);

  const menuState = useMemo(() => {
    const slashMatch = input.match(/(?:^|\s)\/(\S*)$/);
    if (slashMatch) return { kind: 'command' as const, query: slashMatch[1] };
    const atMatch = input.match(/(?:^|\s)@(\S*)$/);
    if (atMatch) return { kind: 'agent' as const, query: atMatch[1] };
    return null;
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (!menuState) return [];
    return commands.filter(
      (cmd) =>
        cmd.kind === menuState.kind &&
        cmd.name.toLowerCase().startsWith(menuState.query.toLowerCase()),
    );
  }, [menuState, commands]);

  const menuOpen = menuState !== null && filteredCommands.length > 0;

  useEffect(() => {
    setMenuIndex(0);
  }, [menuState?.query, menuState?.kind]);

  // -- Image helpers --
  const addImage = useCallback((file: File) => {
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
        prev.length >= MAX_IMAGES ? prev : [...prev, attachment],
      );
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // -- Slash select --
  const handleSlashSelect = useCallback(
    (cmd: CommandEntry) => {
      const prefix = cmd.kind === 'agent' ? 'agent' : 'command';
      const prefixChar = cmd.kind === 'agent' ? '@' : '/';
      const pattern = new RegExp(`(?:^|\\s)[${prefixChar}]\\S*$`);
      const textBefore = input.replace(pattern, '').trim();
      const fullMessage = textBefore
        ? `${textBefore}\n\n[${prefix}:/${cmd.name}]\n${cmd.content}`
        : `[${prefix}:/${cmd.name}]\n${cmd.content}`;

      onSubmit(fullMessage);
      onInputChange('');
      setMenuIndex(0);
      haptics.light();
    },
    [onSubmit, input, onInputChange],
  );

  // -- Submit --
  const handleSubmit = useCallback(async () => {
    const hasText = input.trim().length > 0;
    const hasImages = images.length > 0;
    if ((!hasText && !hasImages) || status === 'streaming' || disabled) return;
    haptics.light();

    let messageText = input.trim();
    let submittedImages: ImageAttachment[] | undefined;

    if (hasImages && uploadImage) {
      const uploaded: ImageAttachment[] = [];
      for (const img of images) {
        const result = await uploadImage(img);
        if (result) uploaded.push(result);
      }
      if (uploaded.length > 0) {
        const refs = uploaded
          .map((img) => `[Image attached: ${img.uploadedPath}]`)
          .join('\n');
        messageText = messageText ? `${refs}\n\n${messageText}` : refs;
        submittedImages = uploaded;
      }
    }

    if (!messageText) return;

    onSubmit(messageText, submittedImages);
    onInputChange('');
    setImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    if (compact) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, images, status, disabled, uploadImage, onSubmit, onInputChange, compact]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  // -- Drag-and-drop (scoped to form) --
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current += 1;
    if (dragCountRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          addImage(file);
        }
      }
    },
    [addImage],
  );

  const hasInput = input.trim().length > 0 || images.length > 0;

  const setInputWrapper = useCallback(
    (value: string | ((prev: string) => string)) => {
      if (typeof value === 'function') {
        // For functional updates, compute new value from current input
        onInputChange(value(input));
      } else {
        onInputChange(value);
      }
    },
    [onInputChange, input],
  );

  const ctx = useMemo(
    () => ({
      input,
      setInput: setInputWrapper,
      images,
      addImage,
      removeImage,
      status,
      hasInput,
      disabled,
      isDragOver,
      onSubmit: handleSubmit,
      onStop: handleStop,
      textareaRef,
      compact,
      keyboardOpen,
      menuState,
      menuOpen,
      menuIndex,
      setMenuIndex,
      filteredCommands,
      handleSlashSelect,
    }),
    [
      input,
      setInputWrapper,
      images,
      addImage,
      removeImage,
      status,
      hasInput,
      disabled,
      isDragOver,
      handleSubmit,
      handleStop,
      compact,
      keyboardOpen,
      menuState,
      menuOpen,
      menuIndex,
      filteredCommands,
      handleSlashSelect,
    ],
  );

  return (
    <PromptInputProvider value={ctx}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative',
          isDragOver && 'ring-2 ring-primary/50 ring-inset rounded-lg',
          className,
        )}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/5">
            <span className="text-sm font-medium text-primary">
              Drop images here
            </span>
          </div>
        )}
        {children}
      </form>
    </PromptInputProvider>
  );
}
