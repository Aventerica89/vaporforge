import { useEffect, useCallback } from 'react';
import { usePromptInput } from './context';
import { cn } from '@/lib/cn';

const MAX_ROWS = 8;
const LINE_HEIGHT = 24;

interface PromptInputTextareaProps {
  placeholder?: string;
  className?: string;
}

export function PromptInputTextarea({
  placeholder = 'Message Claude...',
  className,
}: PromptInputTextareaProps) {
  const {
    input,
    setInput,
    images,
    status,
    disabled,
    textareaRef,
    menuOpen,
    menuState,
    menuIndex,
    setMenuIndex,
    filteredCommands,
    handleSlashSelect,
    onSubmit,
    addImage,
  } = usePromptInput();

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input, textareaRef]);

  // Paste image handling
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImage(file);
          return;
        }
      }
    },
    [addImage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (menuOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMenuIndex((menuIndex + 1) % filteredCommands.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMenuIndex(
            (menuIndex - 1 + filteredCommands.length) % filteredCommands.length,
          );
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const selected = filteredCommands[menuIndex];
          if (selected) {
            const prefix = menuState?.kind === 'agent' ? '@' : '/';
            const replacement = `${prefix}${selected.name} `;
            const pattern = new RegExp(`(?:^|\\s)[${prefix}]\\S*$`);
            setInput(
              input.replace(pattern, (match) =>
                match.startsWith(prefix)
                  ? replacement
                  : match[0] + replacement,
              ),
            );
            setMenuIndex(0);
          }
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const selected = filteredCommands[menuIndex];
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
        onSubmit();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit();
      }
    },
    [
      menuOpen,
      menuIndex,
      filteredCommands,
      menuState,
      input,
      setInput,
      setMenuIndex,
      handleSlashSelect,
      onSubmit,
    ],
  );

  const effectivePlaceholder =
    images.length > 0
      ? 'Add a message about the image(s)...'
      : placeholder;

  return (
    <textarea
      ref={textareaRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={effectivePlaceholder}
      rows={1}
      disabled={status === 'streaming' || disabled}
      className={cn(
        'w-full resize-none bg-transparent px-4 py-3 pr-12 text-base',
        'text-foreground placeholder:text-muted-foreground/60',
        'focus:outline-none disabled:opacity-50',
        className,
      )}
      style={{
        fontSize: '16px',
        color: menuOpen
          ? menuState?.kind === 'agent'
            ? 'hsl(var(--secondary))'
            : 'hsl(var(--primary))'
          : undefined,
      }}
    />
  );
}
