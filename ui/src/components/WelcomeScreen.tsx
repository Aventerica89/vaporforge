import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { Changelog } from './Changelog';
import { CloneRepoModal } from './CloneRepoModal';

/** Format a date string as relative time (e.g. "2h ago", "3d ago") */
function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getSessionName(session: { id: string; metadata?: Record<string, unknown> }): string {
  return (session.metadata as { name?: string })?.name || '';
}

function getSessionLabel(session: { id: string; metadata?: Record<string, unknown> }): string {
  return getSessionName(session) || session.id.slice(0, 8).toUpperCase();
}

export function WelcomeScreen() {
  const {
    sessions,
    createSession,
    selectSession,
    terminateSession,
    renameSession,
    isLoadingSessions,
  } = useSandboxStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleNewSession = async () => {
    await createSession();
  };

  const startRename = (sessionId: string, currentName: string) => {
    setEditingId(sessionId);
    setEditName(currentName);
  };

  const confirmRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (trimmed) {
      await renameSession(editingId, trimmed);
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const visibleSessions = showAll ? sessions : sessions.slice(0, 8);

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
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
                Sessions
                <span className="ml-2 text-primary/60">{sessions.length}</span>
              </h3>
              {sessions.length > 8 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {showAll ? 'Show less' : `Show all (${sessions.length})`}
                </button>
              )}
            </div>
            {isLoadingSessions ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-2">
                {visibleSessions.map((session, index) => (
                  <div
                    key={session.id}
                    className="glass-card group flex w-full items-center justify-between p-4 md:p-5 transition-all duration-300 hover:scale-[1.01] hover:border-primary hover:shadow-[0_0_15px_hsl(var(--primary)/0.2)] animate-fade-up"
                    style={{ animationDelay: `${(index + 1) * 50}ms` }}
                  >
                    {editingId === session.id ? (
                      /* Inline rename form */
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          confirmRename();
                        }}
                        className="flex flex-1 items-center gap-2 min-w-0"
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={confirmRename}
                          className="flex-1 rounded border border-primary/50 bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Session name..."
                          maxLength={60}
                        />
                        <button
                          type="submit"
                          className="rounded p-1 text-success hover:bg-success/10"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      /* Normal session row */
                      <>
                        <button
                          onClick={() => selectSession(session.id)}
                          className="text-left flex-1 min-w-0"
                        >
                          <p className="font-mono text-sm md:text-base font-semibold truncate">
                            {getSessionLabel(session)}
                          </p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate">
                            {session.gitRepo
                              ? session.gitRepo.replace(/^https?:\/\/(github\.com\/)?/, '')
                              : 'Empty workspace'}
                          </p>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div
                            className={`flex items-center gap-1.5 text-xs ${
                              session.status === 'active'
                                ? 'text-success'
                                : session.status === 'sleeping'
                                  ? 'text-warning'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                session.status === 'active'
                                  ? 'bg-green-500'
                                  : session.status === 'sleeping'
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-500'
                              }`}
                            />
                            <span className="hidden sm:inline font-mono uppercase">
                              {session.status}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {timeAgo(session.lastActiveAt)}
                          </span>
                          {/* Rename button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(session.id, getSessionName(session) || getSessionLabel(session));
                            }}
                            className="rounded p-1.5 opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-opacity"
                            title="Rename session"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {/* Delete button */}
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
                              <span className="h-3.5 w-3.5 block animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </>
                    )}
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
