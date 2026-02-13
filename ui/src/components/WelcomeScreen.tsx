import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, Check, X, Undo2, Star, RefreshCw, MessageSquare } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useFavoritesStore } from '@/hooks/useFavorites';
import { useGithubRepos, type GitHubRepo } from '@/hooks/useGithubRepos';
import { useQuickChat } from '@/hooks/useQuickChat';
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

/** Calculate days remaining until permanent deletion */
function daysUntilPurge(deleteScheduledAt: string): number {
  const elapsed = Date.now() - new Date(deleteScheduledAt).getTime();
  const remaining = 5 - elapsed / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(remaining));
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
    restoreSession,
    purgeSession,
    renameSession,
    isLoadingSessions,
  } = useSandboxStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [purgingAll, setPurgingAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const { favorites, removeFavorite } = useFavoritesStore();
  const {
    repos: ghRepos,
    username: ghUsername,
    lastSynced,
    isSyncing: ghSyncing,
    syncRepos,
    setUsername: setGhUsername,
    loadRepos: loadGhRepos,
  } = useGithubRepos();
  const [cloningFavUrl, setCloningFavUrl] = useState<string | null>(null);
  const [cloningGhUrl, setCloningGhUrl] = useState<string | null>(null);
  const [ghUsernameInput, setGhUsernameInput] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const [createError, setCreateError] = useState('');

  const handleNewSession = async () => {
    setCreateError('');
    try {
      await createSession();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session');
    }
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

  const handleCloneFavorite = async (url: string) => {
    setCloningFavUrl(url);
    try {
      const session = await createSession(undefined, url);
      if (session) {
        await selectSession(session.id);
      }
    } catch {
      // Error handled by createSession
    } finally {
      setCloningFavUrl(null);
    }
  };

  const handleCloneGhRepo = async (repo: GitHubRepo) => {
    setCloningGhUrl(repo.html_url);
    try {
      const session = await createSession(undefined, repo.html_url);
      if (session) {
        await selectSession(session.id);
      }
    } catch {
      // Error handled by createSession
    } finally {
      setCloningGhUrl(null);
    }
  };

  const handleSetGhUsername = async () => {
    const trimmed = ghUsernameInput.trim();
    if (!trimmed) return;
    await setGhUsername(trimmed);
    await loadGhRepos();
  };

  const activeSessions = sessions.filter((s) => s.status !== 'pending-delete');
  const pendingDeleteSessions = sessions.filter((s) => s.status === 'pending-delete');
  const visibleSessions = showAll ? activeSessions : activeSessions.slice(0, 8);

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
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-up stagger-2">
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

          <button
            onClick={() => useQuickChat.getState().openQuickChat()}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:scale-[1.02] hover:border-blue-500 hover:shadow-[0_0_20px_hsl(210_100%_50%/0.3)] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-blue-500/10 transition-all duration-300 group-hover:bg-blue-500/20 group-hover:scale-110">
              <MessageSquare className="h-6 w-6 md:h-7 md:w-7 text-blue-500 transition-all duration-300 group-hover:drop-shadow-[0_0_8px_hsl(210_100%_50%/0.8)]" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-base md:text-lg font-bold uppercase tracking-wide">
                Quick Chat
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                AI chat — no sandbox needed
              </p>
            </div>
          </button>
        </div>

        {/* My Repos (GitHub) */}
        {ghUsername ? (
          <div className="space-y-3 animate-fade-up stagger-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
                My Repos
                <span className="ml-2 text-primary/60">{ghRepos.length}</span>
              </h3>
              <div className="flex items-center gap-2">
                {lastSynced && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    {timeAgo(lastSynced)}
                  </span>
                )}
                <button
                  onClick={() => syncRepos()}
                  disabled={ghSyncing}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  title="Sync repos from GitHub"
                >
                  <RefreshCw className={`h-3 w-3 ${ghSyncing ? 'animate-spin' : ''}`} />
                  Sync
                </button>
              </div>
            </div>
            {ghRepos.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {ghRepos.slice(0, 6).map((repo) => (
                  <div
                    key={repo.full_name}
                    className="glass-card group flex items-center justify-between p-3 transition-all duration-200 hover:border-primary/50"
                  >
                    <button
                      onClick={() => handleCloneGhRepo(repo)}
                      disabled={cloningGhUrl !== null}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-mono text-sm font-semibold truncate">
                        {repo.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {repo.language && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {repo.language}
                          </span>
                        )}
                        {repo.description && (
                          <span className="text-[10px] text-muted-foreground/40 truncate">
                            {repo.description}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {cloningGhUrl === repo.html_url ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                          clone
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : ghSyncing ? (
              <div className="flex justify-center py-4">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 text-center py-3">
                No repos found. Click Sync to fetch.
              </p>
            )}
            {ghRepos.length > 6 && (
              <button
                onClick={() => setShowCloneModal(true)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                View all repos ({ghRepos.length})
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-fade-up stagger-2">
            <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
              My Repos
            </h3>
            <div className="glass-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter your GitHub username to sync your repositories
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ghUsernameInput}
                  onChange={(e) => setGhUsernameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSetGhUsername();
                  }}
                  placeholder="GitHub username"
                  className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
                <button
                  onClick={handleSetGhUsername}
                  disabled={!ghUsernameInput.trim()}
                  className="btn-primary px-4 text-sm disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Favorites Quick Clone */}
        {favorites.length > 0 && (
          <div className="space-y-3 animate-fade-up stagger-2">
            <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
              Favorites
              <span className="ml-2 text-yellow-500/60">{favorites.length}</span>
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {favorites.slice(0, 6).map((repo) => (
                <div
                  key={repo.url}
                  className="glass-card group flex items-center justify-between p-3 transition-all duration-200 hover:border-primary/50"
                >
                  <button
                    onClick={() => handleCloneFavorite(repo.url)}
                    disabled={cloningFavUrl !== null}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="font-mono text-sm font-semibold truncate">
                      <span className="text-muted-foreground">{repo.owner}/</span>
                      {repo.name}
                    </p>
                    {repo.description && (
                      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                        {repo.description}
                      </p>
                    )}
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {cloningFavUrl === repo.url ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <button
                        onClick={() => removeFavorite(repo.url)}
                        className="rounded p-1 text-yellow-500 opacity-0 group-hover:opacity-100 hover:bg-yellow-500/10 transition-all"
                        title="Remove from favorites"
                      >
                        <Star className="h-3 w-3 fill-current" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {favorites.length > 6 && (
              <button
                onClick={() => setShowCloneModal(true)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                View all favorites ({favorites.length})
              </button>
            )}
          </div>
        )}

        {/* Error display */}
        {createError && (
          <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error animate-fade-up">
            {createError}
          </div>
        )}

        {/* Recent Sessions */}
        {activeSessions.length > 0 && (
          <div className="space-y-3 md:space-y-4 animate-fade-up stagger-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
                Sessions
                <span className="ml-2 text-primary/60">{activeSessions.length}</span>
              </h3>
              {activeSessions.length > 8 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {showAll ? 'Show less' : `Show all (${activeSessions.length})`}
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

        {/* Pending Delete Sessions */}
        {pendingDeleteSessions.length > 0 && (
          <div className="space-y-3 md:space-y-4 animate-fade-up stagger-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-red-400/70">
                Pending Delete
                <span className="ml-2 text-red-400/40">{pendingDeleteSessions.length}</span>
              </h3>
              <button
                onClick={async () => {
                  setPurgingAll(true);
                  await Promise.all(
                    pendingDeleteSessions.map((s) => purgeSession(s.id))
                  );
                  setPurgingAll(false);
                }}
                disabled={purgingAll}
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-mono uppercase tracking-wide border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all disabled:opacity-50"
                title="Permanently delete all"
              >
                {purgingAll ? (
                  <span className="h-3 w-3 block animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete All
              </button>
            </div>
            <div className="space-y-2">
              {pendingDeleteSessions.map((session) => {
                const scheduledAt = (session.metadata as Record<string, unknown>)?.deleteScheduledAt as string | undefined;
                const days = scheduledAt ? daysUntilPurge(scheduledAt) : 0;

                return (
                  <div
                    key={session.id}
                    className="glass-card group flex w-full items-center justify-between p-4 md:p-5 opacity-60 border-red-500/20 transition-all duration-300 hover:opacity-80"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm md:text-base font-semibold truncate line-through text-muted-foreground">
                        {getSessionLabel(session)}
                      </p>
                      <p className="text-xs text-red-400/70">
                        {days > 0
                          ? `Deletes in ${days} day${days !== 1 ? 's' : ''}`
                          : 'Deleting soon...'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setPurgingId(session.id);
                          await purgeSession(session.id);
                          setPurgingId(null);
                        }}
                        disabled={purgingId === session.id}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-mono uppercase tracking-wide border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all"
                        title="Delete permanently"
                      >
                        {purgingId === session.id ? (
                          <span className="h-3.5 w-3.5 block animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                      <button
                        onClick={async () => {
                          setRestoringId(session.id);
                          await restoreSession(session.id);
                          setRestoringId(null);
                        }}
                        disabled={restoringId === session.id}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-mono uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all"
                        title="Restore session"
                      >
                        {restoringId === session.id ? (
                          <span className="h-3.5 w-3.5 block animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}
                        Undo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
