import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useCommandRegistry, type CommandEntry } from '@/hooks/useCommandRegistry';
import { useSettingsStore } from '@/hooks/useSettings';
import { haptics } from '@/lib/haptics';

interface SlashMenuState {
  kind: 'command' | 'agent';
  query: string;
}

interface UseSlashCommandsReturn {
  menuOpen: boolean;
  menuState: SlashMenuState | null;
  filteredCommands: CommandEntry[];
  menuIndex: number;
  handleSlashSelect: (cmd: CommandEntry) => void;
  handleSlashKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function useSlashCommands(
  input: string,
  setInput: (v: string) => void,
  sendMessage: (text: string) => void,
): UseSlashCommandsReturn {
  const { commands, refresh: refreshCommands } = useCommandRegistry();
  const settingsOpen = useSettingsStore((s) => s.isOpen);
  const prevSettingsOpenRef = useRef(settingsOpen);
  const [menuIndex, setMenuIndex] = useState(0);

  useEffect(() => {
    if (prevSettingsOpenRef.current && !settingsOpen) {
      refreshCommands();
    }
    prevSettingsOpenRef.current = settingsOpen;
  }, [settingsOpen, refreshCommands]);

  const menuState = useMemo((): SlashMenuState | null => {
    const slashMatch = input.match(/(?:^|\s)\/(\S*)$/);
    if (slashMatch) return { kind: 'command', query: slashMatch[1] };
    const atMatch = input.match(/(?:^|\s)@(\S*)$/);
    if (atMatch) return { kind: 'agent', query: atMatch[1] };
    return null;
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (!menuState) return [];
    const q = menuState.query.toLowerCase();
    return commands
      .filter((cmd) => cmd.kind === menuState.kind)
      .filter((cmd) => {
        const name = cmd.name.toLowerCase();
        // Prefix match first, then substring match as fallback
        return name.startsWith(q) || name.includes(q);
      })
      .sort((a, b) => {
        // Prioritize prefix matches over substring matches
        const aPrefix = a.name.toLowerCase().startsWith(q);
        const bPrefix = b.name.toLowerCase().startsWith(q);
        if (aPrefix && !bPrefix) return -1;
        if (!aPrefix && bPrefix) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [menuState, commands]);

  const menuOpen = menuState !== null && filteredCommands.length > 0;

  useEffect(() => {
    setMenuIndex(0);
  }, [menuState?.query, menuState?.kind]);

  const handleSlashSelect = useCallback(
    (cmd: CommandEntry) => {
      const prefixChar = cmd.kind === 'agent' ? '@' : '/';
      const pattern = new RegExp(`(?:^|\\s)[${prefixChar}]\\S*$`);
      const textBefore = input.replace(pattern, '').trim();
      const prefix = cmd.kind === 'agent' ? 'agent' : 'command';
      const fullMessage = textBefore
        ? `${textBefore}\n\n[${prefix}:/${cmd.name}]\n${cmd.content}`
        : `[${prefix}:/${cmd.name}]\n${cmd.content}`;
      sendMessage(fullMessage);
      setInput('');
      setMenuIndex(0);
      haptics.light();
    },
    [sendMessage, input, setInput],
  );

  const handleSlashKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!menuOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex((menuIndex + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex(
          (menuIndex - 1 + filteredCommands.length) % filteredCommands.length,
        );
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCommands[menuIndex];
        if (selected) {
          const pfx = menuState?.kind === 'agent' ? '@' : '/';
          const replacement = `${pfx}${selected.name} `;
          const pat = new RegExp(`(?:^|\\s)[${pfx}]\\S*$`);
          setInput(
            input.replace(pat, (m) =>
              m.startsWith(pfx) ? replacement : m[0] + replacement,
            ),
          );
          setMenuIndex(0);
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = filteredCommands[menuIndex];
        if (selected) handleSlashSelect(selected);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
      }
    },
    [menuOpen, menuIndex, filteredCommands, menuState, input, setInput, handleSlashSelect],
  );

  return {
    menuOpen,
    menuState,
    filteredCommands,
    menuIndex,
    handleSlashSelect,
    handleSlashKeyDown,
  };
}
