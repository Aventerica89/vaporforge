import {
  Plus,
  GitBranch,
  Bug,
  Hammer,
  LogOut,
  Zap,
  Palette,
  Keyboard,
  FileCode,
  Terminal,
  ScrollText,
  Bot,
  Puzzle,
  Key,
  Sparkles,
  Shield,
  HardDrive,
  User,
  CreditCard,
  BookOpen,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { useQuickChat } from '@/hooks/useQuickChat';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { usePlayground } from '@/hooks/usePlayground';
import { useSettingsStore } from '@/hooks/useSettings';
import type { SettingsTab } from '@/hooks/useSettings';
import { haptics } from '@/lib/haptics';
import type { SubView } from '@/hooks/useMobileNav';

interface MoreMenuProps {
  readonly onOpenCloneModal: () => void;
  readonly onSelectSession: (id: string) => void;
  readonly onNavigate: (view: SubView) => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant,
  showChevron,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'danger';
  readonly showChevron?: boolean;
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10'
      : 'hover:bg-primary/10';

  return (
    <button
      onClick={() => {
        haptics.light();
        onClick();
      }}
      className={[
        'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 min-h-[44px]',
        'text-sm font-medium transition-colors active:scale-[0.98]',
        colorClass,
      ].join(' ')}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {showChevron && (
        <ChevronRight className="size-4 text-muted-foreground/40" />
      )}
    </button>
  );
}

function SectionHeader({ children }: { readonly children: string }) {
  return (
    <h4 className="px-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </h4>
  );
}

/** Settings items mapped to their icons (matches SettingsPage TAB_GROUPS) */
const SETTINGS_ICONS: Record<SettingsTab, React.ReactNode> = {
  appearance: <Palette className="size-4" />,
  shortcuts: <Keyboard className="size-4" />,
  'claude-md': <FileCode className="size-4" />,
  rules: <ScrollText className="size-4" />,
  commands: <Terminal className="size-4" />,
  agents: <Bot className="size-4" />,
  integrations: <Puzzle className="size-4" />,
  secrets: <Key className="size-4" />,
  'ai-providers': <Sparkles className="size-4" />,
  'command-center': <Shield className="size-4" />,
  files: <HardDrive className="size-4" />,
  account: <User className="size-4" />,
  billing: <CreditCard className="size-4" />,
  'dev-tools': <Hammer className="size-4" />,
  guide: <BookOpen className="size-4" />,
  about: <Info className="size-4" />,
};

interface SettingsGroup {
  readonly label: string;
  readonly tabs: readonly { readonly id: SettingsTab; readonly label: string }[];
}

const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: 'General',
    tabs: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'shortcuts', label: 'Shortcuts' },
    ],
  },
  {
    label: 'Workspace',
    tabs: [
      { id: 'claude-md', label: 'CLAUDE.md' },
      { id: 'rules', label: 'Rules' },
      { id: 'commands', label: 'Commands' },
      { id: 'agents', label: 'Agents' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'secrets', label: 'Secrets' },
      { id: 'ai-providers', label: 'AI Providers' },
      { id: 'command-center', label: 'Command Center' },
      { id: 'files', label: 'Files' },
    ],
  },
  {
    label: 'Account',
    tabs: [
      { id: 'account', label: 'Account' },
      { id: 'billing', label: 'Billing' },
    ],
  },
  {
    label: 'Developer',
    tabs: [
      { id: 'dev-tools', label: 'Dev Tools' },
    ],
  },
  {
    label: 'Help',
    tabs: [
      { id: 'guide', label: 'Guide' },
      { id: 'about', label: 'About' },
    ],
  },
];

export function MoreMenu({
  onOpenCloneModal,
  onSelectSession,
  onNavigate,
}: MoreMenuProps) {
  const sessions = useSandboxStore((s) => s.sessions);
  const currentSession = useSandboxStore((s) => s.currentSession);
  const createSession = useSandboxStore((s) => s.createSession);
  const logout = useAuthStore((s) => s.logout);

  const handleNewSession = async () => {
    haptics.light();
    await createSession();
  };

  const navigateToSettings = (tabId: SettingsTab) => {
    useSettingsStore.getState().setActiveTab(tabId);
    onNavigate('settings');
  };

  return (
    <div className="flex flex-col overflow-y-auto pb-safe">
      {/* Actions */}
      <div className="p-3 space-y-0.5">
        <SectionHeader>Actions</SectionHeader>
        <MenuItem
          icon={<Plus className="size-4 text-primary" />}
          label="New Session"
          onClick={handleNewSession}
        />
        <MenuItem
          icon={<GitBranch className="size-4 text-secondary" />}
          label="Clone Repo"
          onClick={onOpenCloneModal}
        />
      </div>

      {/* Sessions */}
      {sessions.length > 0 && (
        <div className="p-3 space-y-0.5">
          <SectionHeader>Sessions</SectionHeader>
          {sessions.slice(0, 10).map((session) => {
            const isActive = currentSession?.id === session.id;
            const name =
              (session.metadata as { name?: string })?.name ||
              session.id.slice(0, 8);
            const dotColor =
              session.status === 'active'
                ? 'bg-green-500 shadow-[0_0_6px_hsl(var(--success))]'
                : session.status === 'sleeping'
                  ? 'bg-yellow-500'
                  : 'bg-gray-500';

            return (
              <button
                key={session.id}
                onClick={() => {
                  haptics.light();
                  onSelectSession(session.id);
                }}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm min-h-[44px]',
                  'transition-colors active:scale-[0.98]',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-primary/10',
                ].join(' ')}
              >
                <span
                  className={['size-2 shrink-0 rounded-full', dotColor].join(
                    ' ',
                  )}
                />
                <span className="truncate">{name}</span>
                {isActive && (
                  <span className="ml-auto text-[11px] font-bold uppercase tracking-wider text-primary/60">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tools */}
      <div className="p-3 space-y-0.5">
        <SectionHeader>Tools</SectionHeader>
        <MenuItem
          icon={<Zap className="size-4 text-primary" />}
          label="Quick Chat"
          onClick={() => useQuickChat.getState().openQuickChat()}
        />
        <MenuItem
          icon={<Bug className="size-4 text-orange-500" />}
          label="Bug Tracker"
          onClick={() => useIssueTracker.getState().openTracker()}
        />
        <MenuItem
          icon={<Hammer className="size-4 text-amber-500" />}
          label="Dev Playground"
          onClick={() => usePlayground.getState().openPlayground()}
        />
      </div>

      {/* Settings groups */}
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="p-3 space-y-0.5">
          <SectionHeader>{group.label}</SectionHeader>
          {group.tabs.map((tab) => (
            <MenuItem
              key={tab.id}
              icon={SETTINGS_ICONS[tab.id]}
              label={tab.label}
              onClick={() => navigateToSettings(tab.id)}
              showChevron
            />
          ))}
        </div>
      ))}

      {/* Sign Out */}
      <div className="p-3">
        <div className="border-t border-border/40 pt-3">
          <MenuItem
            icon={<LogOut className="size-4" />}
            label="Sign Out"
            onClick={() => logout()}
            variant="danger"
          />
        </div>
      </div>
    </div>
  );
}
