import { useState, useRef, useEffect } from 'react';
import {
  Plus,
  X,
  Home,
  GitBranch,
  GitCommitHorizontal,
  Moon,
  Sun,
  Settings,
  LogOut,
  Puzzle,
  Bug,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/hooks/useSettings';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import { useQuickChat } from '@/hooks/useQuickChat';
import { useDevChangelog } from '@/hooks/useDevChangelog';
import { triggerCommitMessage } from '@/hooks/useCommitMessage';
import { McpRelayStatus } from '@/components/McpRelayStatus';
import { APP_VERSION } from '@/lib/version';
import { BUILD_HASH, BUILD_TIMESTAMP } from '@/lib/generated/build-info';

function deployedAgo(isoTs: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SessionTabBar() {
  const {
    currentSession,
    sessions,
    selectSession,
    deselectSession,
    createSession,
    terminateSession,
    renameSession,
    gitStatus,
  } = useSandboxStore();
  const { logout } = useAuthStore();
  const { isDark, toggleTheme } = useTheme();
  const { openSettings } = useSettingsStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [editingId]);

  const startRename = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const current =
      (session.metadata as { name?: string })?.name ||
      session.id.slice(0, 8);
    setNameInput(current);
    setEditingId(sessionId);
  };

  const confirmRename = async () => {
    if (!editingId) return;
    const trimmed = nameInput.trim();
    if (trimmed) {
      await renameSession(editingId, trimmed);
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    await terminateSession(sessionId);
    setDeletingId(null);
  };

  const getSessionName = (session: typeof sessions[0]) =>
    (session.metadata as { name?: string })?.name || session.id.slice(0, 8);

  // H5: Use semantic status colors from design tokens where possible.
  // Green/yellow/gray are intentional traffic-light semantics for session state.
  const getStatusColor = (status: string) => {
    if (status === 'active') return 'bg-emerald-500';
    if (status === 'sleeping') return 'bg-amber-500';
    if (status === 'creating') return 'bg-amber-500 animate-pulse';
    return 'bg-muted-foreground/40';
  };

  const visibleSessions = sessions.filter(
    (s) => s.status !== 'pending-delete'
  );

  // HIG: min-h-11 (44px) for tab bar — touch-target compliant on iPad.
  return (
    <div className="flex min-h-11 items-center border-b border-border bg-card safe-area-header">
      {/* Left: New session + tabs */}
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-none">
        {/* Home button — H1: 44×44 touch target */}
        <button
          onClick={() => deselectSession()}
          className={`flex h-11 w-11 shrink-0 items-center justify-center transition-colors hover:bg-accent hover:text-foreground ${
            !currentSession ? 'text-foreground bg-background' : 'text-muted-foreground'
          }`}
          title="Home"
        >
          <Home className="h-3.5 w-3.5" />
        </button>

        {/* New session button — H1: 44×44 touch target */}
        <button
          onClick={() => createSession()}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="New session"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        {/* Session tabs */}
        {visibleSessions.map((session) => {
          const isActive = currentSession?.id === session.id;
          const isEditing = editingId === session.id;

          return (
            <div
              key={session.id}
              className={`group relative flex min-h-[44px] shrink-0 items-center gap-1.5 border-r border-border/50 px-3 text-sm transition-colors ${
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {/* Active indicator — bottom border accent */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
              )}

              {/* Status dot */}
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusColor(
                  session.status
                )}`}
              />

              {/* Tab name — click to select, double-click to rename */}
              {isEditing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmRename();
                  }}
                  className="flex items-center"
                >
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={confirmRename}
                    className="w-[120px] rounded border border-primary/50 bg-background px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    maxLength={60}
                  />
                </form>
              ) : (
                <button
                  onClick={() => selectSession(session.id)}
                  onDoubleClick={() => startRename(session.id)}
                  className="max-w-[140px] truncate text-xs"
                  title={`${getSessionName(session)} — double-click to rename`}
                >
                  {getSessionName(session)}
                </button>
              )}

              {/* C3 HIG fix: Close button — min 44px touch target via full-height flex */}
              {!isEditing && (
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  disabled={deletingId === session.id}
                  className="flex min-h-[44px] min-w-[32px] shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Close session"
                >
                  {deletingId === session.id ? (
                    <span className="block h-3 w-3 animate-spin rounded-full border border-red-500 border-t-transparent" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: status controls */}
      <div className="flex shrink-0 items-center gap-0.5 px-1">
        {/* Deploy badge — updates every build */}
        <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[9px] font-mono text-cyan-400/90">
          v{APP_VERSION} · {deployedAgo(BUILD_TIMESTAMP)}
        </span>
        {/* Dev version badge */}
        <span className="hidden xl:inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[9px] font-mono text-amber-400/80">
          #{BUILD_HASH}
        </span>
        {/* Git branch + AI commit button */}
        {currentSession && gitStatus && (
          <div className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground px-1.5">
            <GitBranch className="h-3 w-3" />
            <span>{gitStatus.branch}</span>
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <span className="text-[9px]">
                {gitStatus.ahead > 0 && `+${gitStatus.ahead}`}
                {gitStatus.ahead > 0 && gitStatus.behind > 0 && '/'}
                {gitStatus.behind > 0 && `-${gitStatus.behind}`}
              </span>
            )}
            {(gitStatus.staged.length > 0 ||
              gitStatus.modified.length > 0 ||
              gitStatus.untracked.length > 0) && (
              <button
                onClick={triggerCommitMessage}
                className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                title="Generate AI commit message (Cmd+Shift+G)"
              >
                <GitCommitHorizontal className="h-3 w-3" />
                <span className="hidden lg:inline">AI Commit</span>
              </button>
            )}
          </div>
        )}

        {/* Session status */}
        {currentSession && (
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground px-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${getStatusColor(
                currentSession.status
              )}`}
            />
            <span className="capitalize">{currentSession.status}</span>
          </div>
        )}

        {/* MCP Relay */}
        {currentSession && <McpRelayStatus />}

        {/* H1 HIG fix: All toolbar buttons → 44×44 touch targets */}
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Agency */}
        <button
          onClick={() => useAgencyStore.getState().openDashboard()}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Agency Sites"
        >
          <Globe className="h-3.5 w-3.5" />
        </button>

        {/* Marketplace */}
        <button
          onClick={() => useMarketplace.getState().openMarketplace()}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Plugin Marketplace (Cmd+Shift+P)"
        >
          <Puzzle className="h-3.5 w-3.5" />
        </button>

        {/* Quick Chat */}
        <button
          onClick={() => useQuickChat.getState().toggleQuickChat()}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Quick Chat (Cmd+Shift+Q)"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>

        {/* Dev Changelog */}
        <button
          onClick={() => {
            const dc = useDevChangelog.getState();
            if (dc.isOpen) {
              dc.closeChangelog();
            } else {
              dc.openChangelog();
            }
          }}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Dev Changelog (Cmd+Shift+L)"
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
        </button>

        {/* Issue Tracker */}
        <button
          onClick={() => useIssueTracker.getState().openTracker()}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Issue Tracker"
        >
          <Bug className="h-3.5 w-3.5" />
        </button>

        {/* Settings */}
        <button
          onClick={() => openSettings()}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        {/* User avatar / menu — H1: minimum 44×44 */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
          >
            U
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                onClick={() => {
                  logout();
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-accent"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
