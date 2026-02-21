import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  FolderTree,
  Terminal,
  Settings,
  Puzzle,
  Bug,
  Hammer,
  LogOut,
  Home,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';
import { MarketplacePage } from './marketplace';
import { useAuthStore } from '@/hooks/useAuth';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { usePlayground } from '@/hooks/usePlayground';
import { haptics } from '@/lib/haptics';

type SidebarView =
  | 'home'
  | 'chat'
  | 'files'
  | 'terminal'
  | 'settings'
  | 'marketplace'
  | 'issues'
  | 'playground';

interface NavItem {
  readonly id: SidebarView;
  readonly label: string;
  readonly icon: LucideIcon;
}

const SESSION_NAV: readonly NavItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

const TOOLS_NAV: readonly NavItem[] = [
  { id: 'marketplace', label: 'Plugins', icon: Puzzle },
  { id: 'issues', label: 'Bug Tracker', icon: Bug },
  { id: 'playground', label: 'Dev Playground', icon: Hammer },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SIDEBAR_WIDTH = 280;

export function TabletLayout() {
  const {
    sessions,
    currentSession,
    isCreatingSession,
    selectSession,
    deselectSession,
    createSession,
  } = useSandboxStore();
  useAutoReconnect();
  const { viewportHeight } = useKeyboard();
  const logout = useAuthStore((s) => s.logout);
  const [activeView, setActiveView] = useState<SidebarView>('chat');
  // M7 HIG fix: Settings and Marketplace render as full-screen overlay sheets,
  // not replacing the content area (which caused a double-sidebar layout).
  const [overlayView, setOverlayView] = useState<'settings' | 'marketplace' | null>(null);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const hasSession = !!currentSession;

  // Switch to chat when session changes
  const sessionId = currentSession?.id;
  useEffect(() => {
    if (sessionId) {
      setActiveView('chat');
    }
  }, [sessionId]);

  const handleNavClick = useCallback(
    (view: SidebarView) => {
      haptics.light();
      if (view === 'home') {
        deselectSession();
        setActiveView('home');
        return;
      }
      // Issues and Playground open as floating overlays
      if (view === 'issues') {
        useIssueTracker.getState().openTracker();
        return;
      }
      if (view === 'playground') {
        usePlayground.getState().openPlayground();
        return;
      }
      // M7: Settings and Marketplace open as full-screen overlay sheets
      if (view === 'settings' || view === 'marketplace') {
        setOverlayView(view);
        return;
      }
      setActiveView(view);
    },
    [deselectSession],
  );

  // M8 HIG fix: Magic Keyboard shortcuts — Cmd+1/2/3 navigate session views.
  useEffect(() => {
    if (!hasSession) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === '1') { e.preventDefault(); setActiveView('chat'); }
      else if (e.key === '2') { e.preventDefault(); setActiveView('files'); }
      else if (e.key === '3') { e.preventDefault(); setActiveView('terminal'); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasSession]);

  const handleSelectSession = useCallback(
    (id: string) => {
      haptics.light();
      selectSession(id);
    },
    [selectSession],
  );

  const handleNewSession = useCallback(async () => {
    haptics.light();
    await createSession();
  }, [createSession]);

  const sessionName = currentSession
    ? (currentSession.metadata as { name?: string })?.name ||
      currentSession.id.slice(0, 8).toUpperCase()
    : null;

  const renderContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;
    if (!hasSession) return <WelcomeScreen />;

    switch (activeView) {
      case 'home':
        return <WelcomeScreen />;
      case 'chat':
        return <ChatPanel />;
      case 'files':
        return (
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        );
      case 'terminal':
        return <XTerminal />;
      case 'issues':
      case 'playground':
        // These are floating overlays — show default content underneath
        return <ChatPanel />;
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: `${viewportHeight}px` }}
    >
      {/* Sidebar */}
      <nav
        className="flex shrink-0 flex-col safe-area-header overflow-y-auto"
        style={{
          width: `${SIDEBAR_WIDTH}px`,
          background: 'rgba(20, 20, 25, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRight: '0.5px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 512 512"
            className="shrink-0"
          >
            <rect width="512" height="512" rx="96" fill="#0f1419" />
            <path
              d="M222 230 L162 296 L222 362"
              stroke="hsl(var(--primary))"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M290 230 L350 296 L290 362"
              stroke="#E945F5"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="text-base font-bold tracking-tight">
            VaporForge
          </span>
        </div>

        {/* Home */}
        <div className="px-3 mb-1">
          <SidebarItem
            icon={Home}
            label="Home"
            active={
              activeView === 'home' ||
              (!hasSession && activeView === 'chat')
            }
            onClick={() => handleNavClick('home')}
          />
        </div>

        {/* Session nav (visible when session active) */}
        {hasSession && (
          <div className="px-3 mb-2">
            <SidebarSectionLabel>Session</SidebarSectionLabel>
            {SESSION_NAV.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeView === item.id}
                onClick={() => handleNavClick(item.id)}
              />
            ))}
          </div>
        )}

        {/* Tools */}
        <div className="px-3 mb-2">
          <SidebarSectionLabel>Tools</SidebarSectionLabel>
          {TOOLS_NAV.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={
                item.id === 'settings' || item.id === 'marketplace'
                  ? overlayView === item.id
                  : activeView === item.id
              }
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </div>

        {/* Sessions list */}
        {sessions.length > 0 && (
          <div className="px-3 mb-2">
            <SidebarSectionLabel>Sessions</SidebarSectionLabel>
            <button
              onClick={handleNewSession}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                'text-sm text-primary hover:bg-primary/10 transition-colors',
              ].join(' ')}
              style={{ minHeight: '44px' }}
            >
              + New Session
            </button>
            {sessions.slice(0, 10).map((session) => {
              const isActive = currentSession?.id === session.id;
              const name =
                (session.metadata as { name?: string })?.name ||
                session.id.slice(0, 8);
              const dotColor =
                session.status === 'active'
                  ? 'bg-green-500'
                  : session.status === 'sleeping'
                    ? 'bg-yellow-500'
                    : 'bg-gray-500';

              return (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                    'text-sm transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50',
                  ].join(' ')}
                  style={{ minHeight: '44px' }}
                >
                  <span
                    className={[
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      dotColor,
                    ].join(' ')}
                  />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Sign Out -- bottom */}
        <div className="mt-auto px-3 pb-3">
          <SidebarItem
            icon={LogOut}
            label="Sign Out"
            active={false}
            onClick={() => {
              haptics.light();
              logout();
            }}
            variant="danger"
          />
        </div>
      </nav>

      {/* Content area */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden safe-area-header">
        {/* Content header with session name */}
        {sessionName && (
            <div
              className="flex shrink-0 items-center px-4 border-b border-border/50"
              style={{ minHeight: '44px' }}
            >
              <span className="text-xs font-medium text-muted-foreground truncate">
                {sessionName}
              </span>
            </div>
          )}
        <div className="flex flex-1 flex-col min-h-0">{renderContent()}</div>
      </div>

      {/* Clone repo modal */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />

      {/* M7 HIG fix: Settings and Marketplace as full-screen overlay sheets,
          preventing the double-sidebar layout bug. */}
      {overlayView && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(10, 10, 15, 0.98)' }}
        >
          {/* Sheet header */}
          <div
            className="flex shrink-0 items-center justify-between px-5 border-b border-border/50"
            style={{ minHeight: '52px' }}
          >
            <span className="text-sm font-semibold text-foreground">
              {overlayView === 'settings' ? 'Settings' : 'Plugins'}
            </span>
            <button
              onClick={() => setOverlayView(null)}
              className="flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent/50 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Sheet content */}
          <div className="flex-1 overflow-y-auto">
            {overlayView === 'settings' ? <SettingsPage /> : <MarketplacePage />}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarSectionLabel({
  children,
}: {
  readonly children: string;
}) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  variant,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly variant?: 'danger';
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10'
      : active
        ? 'bg-primary/15 text-primary'
        : 'text-muted-foreground hover:bg-accent/50';

  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded-lg px-3 py-2',
        'text-[13px] font-medium transition-colors',
        colorClass,
      ].join(' ')}
      style={{ minHeight: '44px' }}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
      {label}
    </button>
  );
}
