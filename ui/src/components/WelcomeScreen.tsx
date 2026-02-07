import { useState } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { Changelog } from './Changelog';
import { CloneRepoModal } from './CloneRepoModal';

export function WelcomeScreen() {
  const { sessions, createSession, selectSession, terminateSession, isLoadingSessions } =
    useSandboxStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCloneModal, setShowCloneModal] = useState(false);

  const handleNewSession = async () => {
    await createSession();
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8 safe-bottom">
      <div className="mx-auto w-full max-w-2xl space-y-6 md:space-y-8 py-8 md:py-16 animate-fade-up">
        {/* Hero Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-display font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary animate-fade-down">
            VAPORFORGE
          </h1>
          <p className="text-base md:text-lg text-muted-foreground animate-fade-down stagger-1">
            Web-based Claude Code IDE
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-fade-down stagger-2">
            <div className="status-indicator text-success">
              <span className="font-mono">ONLINE</span>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 animate-fade-up stagger-2">
          <button
            onClick={handleNewSession}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:scale-[1.02] hover:border-primary hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
              <svg
                className="h-6 w-6 md:h-7 md:w-7 text-primary transition-all duration-300 group-hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-base md:text-lg font-bold uppercase tracking-wide">
                New Session
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                Start fresh workspace
              </p>
            </div>
          </button>

          <button
            onClick={() => setShowCloneModal(true)}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:scale-[1.02] hover:border-secondary hover:shadow-[0_0_20px_hsl(var(--secondary)/0.3)] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-secondary/10 transition-all duration-300 group-hover:bg-secondary/20 group-hover:scale-110">
              <svg
                className="h-6 w-6 md:h-7 md:w-7 text-secondary transition-all duration-300 group-hover:drop-shadow-[0_0_8px_hsl(var(--secondary)/0.8)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-base md:text-lg font-bold uppercase tracking-wide">
                Clone Repo
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                Import from Git
              </p>
            </div>
          </button>
        </div>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div className="space-y-3 md:space-y-4 animate-fade-up stagger-3">
            <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
              Recent Sessions
            </h3>
            {isLoadingSessions ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.slice(0, 5).map((session, index) => (
                  <div
                    key={session.id}
                    className="glass-card group flex w-full items-center justify-between p-4 md:p-5 transition-all duration-300 hover:scale-[1.01] hover:border-primary hover:shadow-[0_0_15px_hsl(var(--primary)/0.2)] animate-fade-up"
                    style={{ animationDelay: `${(index + 1) * 50}ms` }}
                  >
                    <button
                      onClick={() => selectSession(session.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="font-mono text-sm md:text-base font-semibold truncate">
                        {(session.metadata as { name?: string })?.name ||
                          session.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">
                        {session.gitRepo || 'Empty workspace'}
                      </p>
                    </button>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div
                        className={`status-indicator text-xs ${
                          session.status === 'active'
                            ? 'text-success'
                            : session.status === 'sleeping'
                              ? 'text-warning'
                              : 'text-muted-foreground'
                        }`}
                      >
                        <span className="hidden sm:inline font-mono uppercase">
                          {session.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                        {new Date(session.lastActiveAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setDeletingId(session.id);
                          await terminateSession(session.id);
                          setDeletingId(null);
                        }}
                        disabled={deletingId === session.id}
                        className="rounded p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-opacity"
                        title="Delete session"
                      >
                        {deletingId === session.id ? (
                          <span className="h-4 w-4 block animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                        ) : (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Version + Changelog */}
        <Changelog />

        {/* Footer Info */}
        <div className="text-center text-xs text-muted-foreground font-mono animate-fade-up stagger-4">
          <p>Powered by Cloudflare Sandboxes</p>
        </div>
      </div>

      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}
