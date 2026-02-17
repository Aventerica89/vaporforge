import { useEffect } from 'react';
import {
  X,
  Palette,
  Keyboard,
  FileCode,
  Terminal,
  ScrollText,
  Bot,
  Server,
  Puzzle,
  Key,
  User,
  BookOpen,
  Info,
  Shield,
  HardDrive,
  Sparkles,
  Hammer,
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
import { RulesTab } from '@/components/settings/RulesTab';
import { AgentsTab } from '@/components/settings/AgentsTab';
import { McpTab } from '@/components/settings/McpTab';
import { PluginsTab } from '@/components/settings/PluginsTab';
import { SecretsTab } from '@/components/settings/SecretsTab';
import { AccountTab } from '@/components/settings/AccountTab';
import { GuideTab } from '@/components/settings/GuideTab';
import { AboutTab } from '@/components/settings/AboutTab';
import { CommandCenterTab } from '@/components/settings/CommandCenterTab';
import { VaporFilesTab } from '@/components/settings/VaporFilesTab';
import { AIProvidersTab } from '@/components/settings/AIProvidersTab';
import { DevToolsTab } from '@/components/settings/DevToolsTab';

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
      { id: 'appearance', label: 'Appearance', icon: <Palette className="h-[18px] w-[18px]" /> },
      { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: 'Workspace',
    tabs: [
      { id: 'claude-md', label: 'CLAUDE.md', icon: <FileCode className="h-[18px] w-[18px]" /> },
      { id: 'rules', label: 'Rules', icon: <ScrollText className="h-[18px] w-[18px]" /> },
      { id: 'commands', label: 'Commands', icon: <Terminal className="h-[18px] w-[18px]" /> },
      { id: 'agents', label: 'Agents', icon: <Bot className="h-[18px] w-[18px]" /> },
      { id: 'mcp', label: 'MCP Servers', icon: <Server className="h-[18px] w-[18px]" /> },
      { id: 'plugins', label: 'Plugins', icon: <Puzzle className="h-[18px] w-[18px]" /> },
      { id: 'secrets', label: 'Secrets', icon: <Key className="h-[18px] w-[18px]" /> },
      { id: 'ai-providers', label: 'AI Providers', icon: <Sparkles className="h-[18px] w-[18px]" /> },
      { id: 'command-center', label: 'Command Center', icon: <Shield className="h-[18px] w-[18px]" /> },
      { id: 'files', label: 'Files', icon: <HardDrive className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: 'Account',
    tabs: [
      { id: 'account', label: 'Account', icon: <User className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: 'Developer',
    tabs: [
      { id: 'dev-tools', label: 'Dev Tools', icon: <Hammer className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: 'Help',
    tabs: [
      { id: 'guide', label: 'Guide', icon: <BookOpen className="h-[18px] w-[18px]" /> },
      { id: 'about', label: 'About', icon: <Info className="h-[18px] w-[18px]" /> },
    ],
  },
];

const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);

const TAB_CONTENT: Record<SettingsTab, () => JSX.Element> = {
  appearance: AppearanceTab,
  shortcuts: KeyboardShortcutsTab,
  'claude-md': ClaudeMdTab,
  rules: RulesTab,
  commands: CommandsTab,
  agents: AgentsTab,
  mcp: McpTab,
  plugins: PluginsTab,
  secrets: SecretsTab,
  'ai-providers': AIProvidersTab,
  'command-center': CommandCenterTab,
  files: VaporFilesTab,
  account: AccountTab,
  'dev-tools': DevToolsTab,
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
      {/* ─── Top bar (hidden on mobile — MobileNavBar shows title) ─── */}
      {!isMobile && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 py-3 safe-area-header">
          <div className="flex items-center gap-3">
            <h1
              className="font-display text-base font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Settings
            </h1>
            <span className="font-mono text-xs text-muted-foreground/60">
              v{APP_VERSION}
            </span>
          </div>
          <button
            onClick={closeSettings}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ─── Mobile: horizontal tab bar (44pt touch targets per HIG) ─── */}
      {isMobile && (
        <div className="flex shrink-0 overflow-x-auto border-b border-border/60 px-2 scrollbar-none">
          {ALL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.3)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              style={{ minHeight: '44px', fontSize: '13px' }}
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
          <nav className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 px-3 py-4">
            {TAB_GROUPS.map((group) => {
              const isDev = group.label === 'Developer';
              return (
              <div key={group.label} className="mb-2">
                <span className={`mb-1 block px-3 font-display text-[11px] font-bold uppercase tracking-widest ${isDev ? 'text-amber-500/60' : 'text-muted-foreground/50'}`}>
                  {group.label}
                </span>
                {group.tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const devActive = isDev && isActive;
                  const devInactive = isDev && !isActive;
                  return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all text-left ${
                      devActive
                        ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500 -ml-px shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]'
                        : devInactive
                          ? 'text-muted-foreground hover:text-amber-400 hover:bg-amber-500/5 border-l-2 border-transparent -ml-px'
                          : isActive
                            ? 'bg-primary/10 text-primary border-l-2 border-primary -ml-px shadow-[0_0_10px_-3px_hsl(var(--primary)/0.3)]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-primary/5 border-l-2 border-transparent -ml-px'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                  );
                })}
              </div>
              );
            })}
          </nav>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-6">
          <div className="max-w-2xl">
            {/* Section title (desktop only — mobile shows in tab bar) */}
            {!isMobile && (
              <h2 className={`mb-6 font-display text-lg font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r ${
                activeTab === 'dev-tools'
                  ? 'from-amber-400 to-orange-500'
                  : 'from-foreground to-muted-foreground'
              }`}>
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
