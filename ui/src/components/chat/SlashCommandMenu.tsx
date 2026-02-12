import { useEffect, useRef } from 'react';
import type { CommandEntry } from '@/hooks/useCommandRegistry';

interface SlashCommandMenuProps {
  query: string;
  commands: CommandEntry[];
  selectedIndex: number;
  onSelect: (command: CommandEntry) => void;
  onDismiss: () => void;
}

export function SlashCommandMenu({
  query,
  commands,
  selectedIndex,
  onSelect,
  onDismiss,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Already pre-filtered by kind in PromptInput — just match on query
  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(query.toLowerCase())
  );

  const isAgentMode = filtered.length > 0 && filtered[0].kind === 'agent';

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onDismiss]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[272px] overflow-y-auto rounded-lg border border-border/60 bg-card shadow-lg backdrop-blur-sm"
      role="listbox"
    >
      {filtered.map((cmd, i) => (
        <button
          key={`${cmd.source}-${cmd.name}`}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex
              ? isAgentMode
                ? 'bg-secondary/10 text-foreground'
                : 'bg-primary/10 text-foreground'
              : 'text-foreground/80 hover:bg-muted/50'
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // Keep textarea focus
            onSelect(cmd);
          }}
        >
          {/* Name with prefix: @ for agents (purple), / for commands (teal) */}
          <span className={`shrink-0 font-mono ${
            cmd.kind === 'agent' ? 'text-secondary' : 'text-primary'
          }`}>
            {cmd.kind === 'agent' ? '@' : '/'}{cmd.name}
          </span>

          {/* Description */}
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {cmd.description}
          </span>

          {/* Source badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              cmd.source === 'user'
                ? 'bg-muted text-muted-foreground'
                : 'bg-secondary/15 text-secondary'
            }`}
          >
            {cmd.source === 'user' ? 'user' : cmd.source}
          </span>
        </button>
      ))}
    </div>
  );
}
