import { usePromptInput } from './context';
import { SlashCommandMenu } from '@/components/chat/SlashCommandMenu';

export function PromptInputSlashMenu() {
  const {
    menuOpen,
    menuState,
    filteredCommands,
    menuIndex,
    handleSlashSelect,
    setInput,
  } = usePromptInput();

  if (!menuOpen) return null;

  return (
    <SlashCommandMenu
      query={menuState?.query ?? ''}
      commands={filteredCommands}
      selectedIndex={menuIndex}
      onSelect={handleSlashSelect}
      onDismiss={() => setInput('')}
    />
  );
}
