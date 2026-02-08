import { Keyboard } from 'lucide-react';

interface Shortcut {
  action: string;
  keys: string[];
}

const SHORTCUT_GROUPS: Array<{
  label: string;
  shortcuts: Shortcut[];
}> = [
  {
    label: 'Chat',
    shortcuts: [
      { action: 'Send message', keys: ['Enter'] },
      { action: 'Send message (alt)', keys: ['\u2318', 'Enter'] },
      { action: 'New line', keys: ['Shift', 'Enter'] },
    ],
  },
  {
    label: 'Panels',
    shortcuts: [
      { action: 'Toggle files', keys: ['\u2318', '1'] },
      { action: 'Toggle terminal', keys: ['\u2318', '2'] },
      { action: 'Toggle chat', keys: ['\u2318', '3'] },
    ],
  },
  {
    label: 'Editor',
    shortcuts: [
      { action: 'Save CLAUDE.md', keys: ['\u2318', 'S'] },
    ],
  },
  {
    label: 'Navigation',
    shortcuts: [
      { action: 'Close settings / dialogs', keys: ['Esc'] },
    ],
  },
];

export function KeyboardShortcutsTab() {
  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Keyboard className="h-4 w-4 text-primary" />
          Keyboard Shortcuts
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Key combinations for faster navigation. On Windows/Linux,
          use Ctrl instead of {'\u2318'}.
        </p>
      </section>

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <h4 className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground/60">
            {group.label}
          </h4>
          <div className="rounded-lg border border-border divide-y divide-border">
            {group.shortcuts.map((shortcut) => (
              <div
                key={shortcut.action}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <span className="text-sm text-foreground">
                  {shortcut.action}
                </span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i}>
                      <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground shadow-sm">
                        {key}
                      </kbd>
                      {i < shortcut.keys.length - 1 && (
                        <span className="mx-0.5 text-muted-foreground/40">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
