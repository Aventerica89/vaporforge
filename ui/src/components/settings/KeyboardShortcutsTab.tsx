import { Keyboard, LayoutGrid } from 'lucide-react';
import { useLayoutStore } from '@/hooks/useLayoutStore';

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
    label: 'AI Tools',
    shortcuts: [
      { action: 'Quick Chat', keys: ['\u2318', 'Shift', 'Q'] },
      { action: 'Code Transform', keys: ['\u2318', 'Shift', 'T'] },
      { action: 'Code Analysis', keys: ['\u2318', 'Shift', 'A'] },
      { action: 'Commit Message', keys: ['\u2318', 'Shift', 'G'] },
    ],
  },
  {
    label: 'Panels',
    shortcuts: [
      { action: 'Toggle files', keys: ['\u2318', '1'] },
      { action: 'Toggle editor/terminal', keys: ['\u2318', '2'] },
      { action: 'Focus mode (full-screen chat)', keys: ['\u2318', '3'] },
      { action: 'Reset layout to default', keys: ['\u2318', 'Shift', '0'] },
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
      { action: 'Plugin Marketplace', keys: ['\u2318', 'Shift', 'P'] },
      { action: 'Dev Playground', keys: ['\u2318', 'Shift', 'D'] },
      { action: 'Dev Changelog', keys: ['\u2318', 'Shift', 'L'] },
      { action: 'Close settings / dialogs', keys: ['Esc'] },
    ],
  },
];

export function KeyboardShortcutsTab() {
  const { currentSizes, saveAsDefault, resetToDefault } = useLayoutStore();
  const rounded = currentSizes.map((s) => Math.round(s));

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

      {/* Panel Layout section */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-muted-foreground/60">
          <LayoutGrid className="h-3.5 w-3.5" />
          Panel Layout
        </h4>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 h-6 rounded overflow-hidden border border-border">
              {rounded.map((size, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center text-[10px] font-mono text-muted-foreground border-r border-border last:border-r-0 bg-muted/50"
                  style={{ width: `${size}%` }}
                >
                  {size}%
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveAsDefault}
              className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:border-primary/30"
            >
              Save Current as Default
            </button>
            <button
              onClick={resetToDefault}
              className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:border-primary/30"
            >
              Reset to Default
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Panel sizes persist automatically. Use {'\u2318'}+Shift+0 to reset.
          </p>
        </div>
      </div>
    </div>
  );
}
