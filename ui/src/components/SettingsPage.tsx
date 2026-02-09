import { useEffect } from 'react';
import {
  ArrowLeft,
  Palette,
  Keyboard,
  FileCode,
  Terminal,
  Server,
  Puzzle,
  Key,
  User,
  BookOpen,
  Info,
} from 'lucide-react';
import { useSettingsStore } from '@/hooks/useSettings';
import type { SettingsTab } from '@/hooks/useSettings';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { useKeyboard } from '@/hooks/useKeyboard';
import { APP_VERSION } from '@/lib/version';

// Tab content components
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { KeyboardShortcutsTab } from '@/components/settings/KeyboardShortcutsTab';
import { ClaudeMdTab } from '@/components/settings/ClaudeMdTab';
import { CommandsTab } from '@/components/settings/CommandsTab';
import { McpTab } from '@/components/settings/McpTab';
import { PluginsTab } from '@/components/settings/PluginsTab';
import { SecretsTab } from '@/components/settings/SecretsTab';
import { AccountTab } from '@/components/settings/AccountTab';
import { GuideTab } from '@/components/settings/GuideTab';
import { AboutTab } from '@/components/settings/AboutTab';

/* ─── Tab definitions ─── */

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

interface TabGroup {
  label: string;
  tabs: TabDef[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'General',
    tabs: [
      { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
      { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Workspace',
    tabs: [
      { id: 'claude-md', label: 'CLAUDE.md', icon: <FileCode className="h-4 w-4" /> },
      { id: 'commands', label: 'Commands', icon: <Terminal className="h-4 w-4" /> },
      { id: 'mcp', label: 'MCP Servers', icon: <Server className="h-4 w-4" /> },
      { id: 'plugins', label: 'Plugins', icon: <Puzzle className="h-4 w-4" /> },
      { id: 'secrets', label: 'Secrets', icon: <Key className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Account',
    tabs: [
      { id: 'account', label: 'Account', icon: <User className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Help',
    tabs: [
      { id: 'guide', label: 'Guide', icon: <BookOpen className="h-4 w-4" /> },
      { id: 'about', label: 'About', icon: <Info className="h-4 w-4" /> },
    ],
  },
];

const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);

const TAB_CONTENT: Record<SettingsTab, () => JSX.Element> = {
  appearance: AppearanceTab,
  shortcuts: KeyboardShortcutsTab,
  'claude-md': ClaudeMdTab,
  commands: CommandsTab,
  mcp: McpTab,
  plugins: PluginsTab,
  secrets: SecretsTab,
  account: AccountTab,
  guide: GuideTab,
  about: AboutTab,
};

/* ─── Settings Page ─── */

export function SettingsPage() {
  const { activeTab, setActiveTab, closeSettings } = useSettingsStore();
  const { layoutTier } = useDeviceInfo();
  const isMobile = layoutTier === 'phone';

  // Mobile: use viewportHeight for iOS keyboard safety
  const { viewportHeight } = useKeyboard();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeSettings]);

  const TabContent = TAB_CONTENT[activeTab];
  const activeLabel = ALL_TABS.find((t) => t.id === activeTab)?.label || 'Settings';

  return (
    <div
      className="flex flex-col bg-background overflow-hidden"
      style={isMobile ? { height: `${viewportHeight}px` } : { height: '100vh' }}
    >
      {/* ─── Top bar ─── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] h-12"
      >
        <button
          onClick={closeSettings}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="h-4 w-px bg-border" />

        <h1 className="font-display text-sm font-bold uppercase tracking-wider text-primary">
          Settings
        </h1>

        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">
          v{APP_VERSION}
        </span>
      </div>

      {/* ─── Mobile: horizontal tab bar ─── */}
      {isMobile && (
        <div className="flex shrink-0 overflow-x-auto border-b border-border px-3 scrollbar-none">
          {ALL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── Body: sidebar (desktop) + content ─── */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        {!isMobile && (
          <nav className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border px-3 py-4">
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <span className="mb-1 block px-3 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  {group.label}
                </span>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary border-l-2 border-primary -ml-px'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/30 border-l-2 border-transparent -ml-px'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-6">
          <div className="max-w-2xl">
            {/* Section title (desktop only — mobile shows in tab bar) */}
            {!isMobile && (
              <h2 className="mb-6 font-display text-lg font-bold uppercase tracking-wider text-foreground">
                {activeLabel}
              </h2>
            )}
            <TabContent />
          </div>
        </div>
      </div>
    </div>
  );
}
