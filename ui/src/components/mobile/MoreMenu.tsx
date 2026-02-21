import {
  Plus,
  GitBranch,
  Settings,
  Puzzle,
  Bug,
  Hammer,
  LogOut,
  Zap,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { useQuickChat } from '@/hooks/useQuickChat';
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
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'danger';
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10'
      : 'hover:bg-accent';

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
      {label}
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

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Actions */}
      <div className="p-3 space-y-0.5">
        <SectionHeader>Actions</SectionHeader>
        <MenuItem
          icon={<Plus className="h-4.5 w-4.5 text-primary" />}
          label="New Session"
          onClick={handleNewSession}
        />
        <MenuItem
          icon={<GitBranch className="h-4.5 w-4.5 text-secondary" />}
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
                ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
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
                    : 'hover:bg-accent',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 shrink-0 rounded-full',
                    dotColor,
                  ].join(' ')}
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
          icon={<Zap className="h-4.5 w-4.5 text-primary" />}
          label="Quick Chat"
          onClick={() => useQuickChat.getState().openQuickChat()}
        />
        <MenuItem
          icon={<Bug className="h-4.5 w-4.5 text-orange-500" />}
          label="Bug Tracker"
          onClick={() => onNavigate('issues')}
        />
        <MenuItem
          icon={<Hammer className="h-4.5 w-4.5 text-amber-500" />}
          label="Dev Playground"
          onClick={() => onNavigate('playground')}
        />
        <MenuItem
          icon={<Puzzle className="h-4.5 w-4.5 text-primary" />}
          label="Plugins"
          onClick={() => onNavigate('marketplace')}
        />
        <MenuItem
          icon={<Settings className="h-4.5 w-4.5 text-muted-foreground" />}
          label="Settings"
          onClick={() => onNavigate('settings')}
        />
      </div>

      {/* Sign Out */}
      <div className="p-3 mt-auto">
        <MenuItem
          icon={<LogOut className="h-4.5 w-4.5" />}
          label="Sign Out"
          onClick={() => logout()}
          variant="danger"
        />
      </div>
    </div>
  );
}
