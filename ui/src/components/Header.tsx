import { useState } from 'react';
import {
  Menu,
  ChevronDown,
  GitBranch,
  Cloud,
  Settings,
  LogOut,
  Plus,
  Moon,
  Sun,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';

export function Header() {
  const { currentSession, sessions, selectSession, createSession, gitStatus } =
    useSandboxStore();
  const { logout } = useAuthStore();
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4 safe-top">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <button className="rounded-md p-1.5 hover:bg-accent md:hidden">
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <span className="font-semibold">VaporForge</span>
        </div>

        {/* Session selector */}
        <div className="relative">
          <button
            onClick={() => setShowSessionMenu(!showSessionMenu)}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <span className="max-w-[150px] truncate">
              {currentSession
                ? (currentSession.metadata as { name?: string })?.name ||
                  currentSession.id.slice(0, 8)
                : 'No Session'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {showSessionMenu && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                onClick={async () => {
                  await createSession();
                  setShowSessionMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
                New Session
              </button>

              {sessions.length > 0 && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div className="max-h-60 overflow-y-auto">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          selectSession(session.id);
                          setShowSessionMenu(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent ${
                          currentSession?.id === session.id ? 'bg-accent' : ''
                        }`}
                      >
                        <span className="truncate">
                          {(session.metadata as { name?: string })?.name ||
                            session.id.slice(0, 8)}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            session.status === 'active'
                              ? 'bg-green-500'
                              : session.status === 'sleeping'
                                ? 'bg-yellow-500'
                                : 'bg-gray-500'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Git branch */}
        {currentSession && gitStatus && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{gitStatus.branch}</span>
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <span className="text-xs">
                {gitStatus.ahead > 0 && `+${gitStatus.ahead}`}
                {gitStatus.ahead > 0 && gitStatus.behind > 0 && '/'}
                {gitStatus.behind > 0 && `-${gitStatus.behind}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Session status */}
        {currentSession && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
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
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
          >
            U
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                onClick={() => setShowUserMenu(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="my-1 border-t border-border" />
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
    </header>
  );
}
