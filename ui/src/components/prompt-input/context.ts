import { createContext, useContext } from 'react';
import type { ImageAttachment } from '@/lib/types';
import type { CommandEntry } from '@/hooks/useCommandRegistry';

export type PromptInputStatus = 'idle' | 'streaming' | 'uploading';

export interface PromptInputContextValue {
  input: string;
  setInput: (value: string | ((prev: string) => string)) => void;
  images: ImageAttachment[];
  addImage: (file: File) => void;
  removeImage: (id: string) => void;
  status: PromptInputStatus;
  hasInput: boolean;
  disabled: boolean;
  isDragOver: boolean;
  onSubmit: () => void;
  onStop: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  compact: boolean;
  keyboardOpen: boolean;
  // Slash command state
  menuState: { kind: 'command' | 'agent'; query: string } | null;
  menuOpen: boolean;
  menuIndex: number;
  setMenuIndex: (i: number) => void;
  filteredCommands: CommandEntry[];
  handleSlashSelect: (cmd: CommandEntry) => void;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

export const PromptInputProvider = PromptInputContext.Provider;

export function usePromptInput(): PromptInputContextValue {
  const ctx = useContext(PromptInputContext);
  if (!ctx) {
    throw new Error('usePromptInput must be used within <PromptInput>');
  }
  return ctx;
}
