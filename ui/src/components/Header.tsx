import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  GitBranch,
  Cloud,
  LogOut,
  Plus,
  Moon,
  Sun,
  Home,
  Trash2,
  Pencil,
  Check,
  X,
  Settings,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { SettingsDialog } from './SettingsDialog';

export function Header() {
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
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        sessionMenuRef.current &&
        !sessionMenuRef.current.contains(e.target as Node)
      ) {
        setShowSessionMenu(false);
      }
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

  const handleDelete = async (
    e: React.MouseEvent,
    sessionId: string
  ) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    await terminateSession(sessionId);
    setDeletingId(null);
  };

  const startEditName = () => {
    if (!currentSession) return;
    const current =
      (currentSession.metadata as { name?: string })?.name ||
      currentSession.id.slice(0, 8);
    setNameInput(current);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const confirmEditName = async () => {
    if (!currentSession) return;
    const trimmed = nameInput.trim();
    if (trimmed) {
      await renameSession(currentSession.id, trimmed);
    }
    setEditingName(false);
  };

  const cancelEditName = () => {
    setEditingName(false);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-3">
      {/* Left section */}
      <div className="flex items-center gap-2">
        {/* Home / Logo */}
        <button
          onClick={currentSession ? deselectSession : undefined}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
            currentSession
              ? 'hover:bg-accent cursor-pointer'
              : 'cursor-default'
          }`}
          title={currentSession ? 'Back to home' : 'VaporForge'}
        >
          {currentSession ? (
            <Home className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Cloud className="h-5 w-5 text-primary" />
          )}
          <span className="text-sm font-semibold hidden sm:inline">
            VaporForge
          </span>
        </button>

        {/* Separator */}
        {currentSession && (
          <span className="text-muted-foreground/40 text-sm">/</span>
        )}

        {/* Session selector */}
        <div className="relative" ref={sessionMenuRef}>
          {editingName && currentSession ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirmEditName();
              }}
              className="flex items-center gap-1"
            >
              <input
                ref={nameInputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEditName();
                }}
                onBlur={confirmEditName}
                className="w-[140px] sm:w-[180px] rounded border border-primary/50 bg-background px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Session name..."
                maxLength={60}
              />
              <button
                type="submit"
                className="rounded p-1 text-success hover:bg-success/10"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelEditName}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setShowSessionMenu(!showSessionMenu)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
              >
                <span className="max-w-[120px] truncate sm:max-w-[180px]">
                  {currentSession
                    ? (currentSession.metadata as { name?: string })?.name ||
                      currentSession.id.slice(0, 8)
                    : 'Sessions'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {currentSession && (
                <button
                  onClick={startEditName}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
                  title="Rename session"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {showSessionMenu && (
            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                onClick={async () => {
                  await createSession();
                  setShowSessionMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <Plus className="h-4 w-4 text-primary" />
                New Session
              </button>

              {sessions.length > 0 && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div className="max-h-64 overflow-y-auto">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent ${
                          currentSession?.id === session.id
                            ? 'bg-accent/50'
                            : ''
                        }`}
                      >
                        <button
                          onClick={() => {
                            selectSession(session.id);
                            setShowSessionMenu(false);
                          }}
                          className="flex flex-1 items-center gap-2 min-w-0"
                        >
                          <span
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                              session.status === 'active'
                                ? 'bg-green-500'
                                : session.status === 'sleeping'
                                  ? 'bg-yellow-500'
                                  : 'bg-gray-500'
                            }`}
                          />
                          <span className="truncate">
                            {(session.metadata as { name?: string })?.name ||
                              session.id.slice(0, 8)}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                            {new Date(
                              session.lastActiveAt
                            ).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, session.id)}
                          disabled={deletingId === session.id}
                          className="ml-2 rounded p-1 opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                          title="Delete session"
                        >
                          {deletingId === session.id ? (
                            <span className="h-3.5 w-3.5 block animate-spin rounded-full border border-red-500 border-t-transparent" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Git branch */}
        {currentSession && gitStatus && (
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span>{gitStatus.branch}</span>
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <span className="text-[10px]">
                {gitStatus.ahead > 0 && `+${gitStatus.ahead}`}
                {gitStatus.ahead > 0 && gitStatus.behind > 0 && '/'}
                {gitStatus.behind > 0 && `-${gitStatus.behind}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1.5">
        {/* Session status */}
        {currentSession && (
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentSession.status === 'active'
                  ? 'bg-green-500'
                  : currentSession.status === 'creating'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-gray-500'
              }`}
            />
            <span className="capitalize">{currentSession.status}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 hover:bg-accent"
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="rounded-md p-1.5 hover:bg-accent"
          title="Settings & Help"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
          >
            U
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-card py-1 shadow-lg">
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

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </header>
  );
}
