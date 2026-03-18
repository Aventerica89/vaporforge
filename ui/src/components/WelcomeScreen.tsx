import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, Check, X, Undo2, Star, RefreshCw, MessageSquare, Search } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useFavoritesStore } from '@/hooks/useFavorites';
import { useGithubRepos, type GitHubRepo } from '@/hooks/useGithubRepos';
import { useQuickChat } from '@/hooks/useQuickChat';
import { githubApi } from '@/lib/api';
import { BranchPicker, BranchPill } from './BranchPicker';
import { Changelog } from './Changelog';
import { CloneRepoModal } from './CloneRepoModal';
import { BUILD_HASH, BUILD_DATE } from '@/lib/generated/build-info';
import { APP_VERSION } from '@/lib/version';
import {
  CloudflareLogo,
  AnthropicLogo,
  ReactLogo,
  GithubLogo,
} from '@/components/logos';

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
  const { favorites, toggleFavorite, isFavorite } = useFavoritesStore();
  const {
    repos: ghRepos,
    username: ghUsername,
    lastSynced,
    isSyncing: ghSyncing,
    syncRepos,
    expandedRepo,
    setExpandedRepo,
    selectedBranch,
    branchesFor,
  } = useGithubRepos();
  const [cloningGhUrl, setCloningGhUrl] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
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

  const handleCloneGhRepo = async (repo: GitHubRepo) => {
    setCloningGhUrl(repo.html_url);
    try {
      const branch = selectedBranch[repo.full_name] || branchesFor[repo.full_name]?.defaultBranch;
      const session = await createSession(undefined, repo.html_url, branch);
      if (session) {
        await selectSession(session.id);
      }
    } catch {
      // Error handled by createSession
    } finally {
      setCloningGhUrl(null);
    }
  };

  const activeSessions = sessions.filter((s) => s.status !== 'pending-delete');
  const pendingDeleteSessions = sessions.filter((s) => s.status === 'pending-delete');
  const visibleSessions = showAll ? activeSessions : activeSessions.slice(0, 8);

  return (
    <div className="flex-1 w-full min-w-0 overflow-y-auto p-4 md:p-8 safe-bottom">
      <div className="mx-auto w-full max-w-2xl min-w-0 space-y-6 md:space-y-8 py-8 md:py-16 animate-fade-up">
        {/* Hero Header */}
        <div className="text-center space-y-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="80"
            viewBox="0 0 512 512"
            className="mx-auto rounded-2xl border border-border shadow-[0_0_20px_hsl(var(--primary)/0.3)] animate-fade-down"
          >
            <rect width="512" height="512" rx="96" fill="#0f1419" />
            <path d="M222 230 L162 296 L222 362" stroke="hsl(var(--primary))" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M290 230 L350 296 L290 362" stroke="#E945F5" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
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
        <div className="grid grid-cols-1 gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-up stagger-2">
          <button
            onClick={handleNewSession}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:border-primary hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)] active:scale-[0.97] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-primary/10 transition-all duration-200 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] group-hover:bg-primary/20 group-hover:scale-110">
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
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:border-secondary hover:shadow-[0_0_20px_hsl(var(--secondary)/0.3)] active:scale-[0.97] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-secondary/10 transition-all duration-200 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] group-hover:bg-secondary/20 group-hover:scale-110">
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
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:border-blue-500 hover:shadow-[0_0_20px_hsl(210_100%_50%/0.3)] active:scale-[0.97] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-blue-500/10 transition-all duration-200 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] group-hover:bg-blue-500/20 group-hover:scale-110">
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

        {/* Active Sessions — above repos for quick resume */}
        {activeSessions.length > 0 && (
          <div className="space-y-3 md:space-y-4 animate-fade-up stagger-2">
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
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleSessions.map((session) => {
                  const statusColor = session.status === 'active'
                    ? 'bg-gradient-to-b from-emerald-500 to-emerald-600'
                    : session.status === 'sleeping'
                      ? 'bg-gradient-to-b from-yellow-500 to-amber-600'
                      : 'bg-[#2d333b]';

                  return editingId === session.id ? (
                    <div
                      key={session.id}
                      className="flex overflow-hidden rounded-[10px] bg-[#111820] shadow-[0_2px_16px_rgba(0,0,0,0.2)]"
                    >
                      <div className="w-[3px] flex-shrink-0 bg-primary" />
                      <form
                        onSubmit={(e) => { e.preventDefault(); confirmRename(); }}
                        className="flex flex-1 items-center gap-2 px-4 py-3"
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          name="session-name"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Session name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') cancelRename(); }}
                          onBlur={confirmRename}
                          className="flex-1 rounded border border-primary/50 bg-background px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          maxLength={60}
                          placeholder="Session name\u2026"
                        />
                        <button type="submit" className="size-8 flex items-center justify-center rounded text-success hover:bg-success/10" title="Save">
                          <Check className="size-3.5" />
                        </button>
                        <button type="button" onClick={cancelRename} className="size-8 flex items-center justify-center rounded text-muted-foreground hover:bg-primary/10" title="Cancel">
                          <X className="size-3.5" />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div
                      key={session.id}
                      className="group flex overflow-hidden rounded-[10px] bg-[#111820] shadow-[0_2px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_2px_16px_rgba(0,0,0,0.3)] transition-[box-shadow] duration-150"
                    >
                      <div className={`w-[3px] flex-shrink-0 ${statusColor}`} />
                      <div className="flex-1 min-w-0 flex flex-col px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => selectSession(session.id)}
                            className="text-left min-w-0 flex-1"
                          >
                            <span className="text-sm font-semibold text-[#cdd9e5] truncate block">
                              {getSessionLabel(session)}
                            </span>
                          </button>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`size-1.5 rounded-full ${
                              session.status === 'active' ? 'bg-emerald-500' : session.status === 'sleeping' ? 'bg-yellow-500' : 'bg-gray-500'
                            }`} />
                            <span className="text-[11px] text-[#768390] font-mono tabular-nums">
                              {timeAgo(session.lastActiveAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[11px] text-[#768390] truncate">
                            {session.gitRepo
                              ? session.gitRepo.replace(/^https?:\/\/(github\.com\/)?/, '')
                              : 'Empty workspace'}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); startRename(session.id, getSessionName(session) || getSessionLabel(session)); }}
                              className="rounded p-1.5 hover:bg-primary/10 hover:text-primary"
                              title="Rename"
                              aria-label="Rename session"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              onClick={async (e) => { e.stopPropagation(); setDeletingId(session.id); await terminateSession(session.id); setDeletingId(null); }}
                              disabled={deletingId === session.id}
                              className="rounded p-1.5 hover:bg-red-500/10 hover:text-red-500"
                              title="Delete"
                              aria-label="Delete session"
                            >
                              {deletingId === session.id ? (
                                <span className="size-3 block animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* My Repos (GitHub) */}
        {ghUsername ? (
          <div className="space-y-3 animate-fade-up stagger-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span>My Repos</span>
                <span className="text-primary/60">{ghRepos.length}</span>
                <span className="text-[10px] font-mono normal-case tracking-normal text-primary/70">@{ghUsername}</span>
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

            {/* Repo search */}
            {ghRepos.length > 6 && (
              <div className="flex items-center gap-2 rounded-lg bg-[#0a0e14] border border-[#1DD3E6]/10 focus-within:border-[#1DD3E6]/40 transition-colors px-3 py-2">
                <Search className="h-3.5 w-3.5 text-[#4b535d] flex-shrink-0" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Filter repos..."
                  className="flex-1 bg-transparent text-xs text-[#cdd9e5] placeholder-[#4b535d] outline-none ring-0 border-0 focus:outline-none focus:ring-0"
                />
                {repoSearch && (
                  <button onClick={() => setRepoSearch('')} className="text-[#4b535d] hover:text-[#768390]">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {ghRepos.length > 0 ? (() => {
              // Sort: pinned first, then by updated_at
              const pinnedUrls = new Set(favorites.map((f) => f.url));
              const filtered = repoSearch
                ? ghRepos.filter((r) => r.name.toLowerCase().includes(repoSearch.toLowerCase()) || r.full_name.toLowerCase().includes(repoSearch.toLowerCase()))
                : ghRepos;
              const sorted = [...filtered].sort((a, b) => {
                const aPinned = pinnedUrls.has(a.html_url);
                const bPinned = pinnedUrls.has(b.html_url);
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;
                return 0;
              });

              return (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {sorted.map((repo) => {
                    const isExpanded = expandedRepo === repo.full_name;
                    const isCloning = cloningGhUrl === repo.html_url;
                    const branch = selectedBranch[repo.full_name] || branchesFor[repo.full_name]?.defaultBranch || 'main';
                    const isPinned = isFavorite(repo.html_url);

                    return (
                      <div
                        key={repo.full_name}
                        className={`group flex overflow-hidden rounded-[10px] transition-all duration-200 ${
                          isCloning
                            ? 'bg-[#111820] shadow-[0_2px_20px_rgba(29,211,230,0.08)]'
                            : isExpanded
                              ? 'bg-[#111820] shadow-[0_4px_24px_rgba(0,0,0,0.25)]'
                              : 'bg-[#111820] shadow-[0_2px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_2px_16px_rgba(0,0,0,0.3)]'
                        }`}
                      >
                        {/* Accent bar */}
                        <div
                          className={`w-[3px] flex-shrink-0 ${
                            isCloning
                              ? 'bg-gradient-to-b from-[#1DD3E6] to-[#1DD3E680]'
                              : isPinned
                                ? 'bg-gradient-to-b from-yellow-500 to-[#a371f7]'
                                : 'bg-gradient-to-b from-[#1DD3E6] to-[#a371f7]'
                          }`}
                        />
                        <div className="flex-1 min-w-0 flex flex-col">
                          {/* Card body */}
                          <div className="flex flex-col gap-2 px-4 py-3">
                            {/* Top row: pin + name + branch pill */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite({
                                      url: repo.html_url,
                                      name: repo.name,
                                      owner: repo.full_name.split('/')[0],
                                      description: repo.description || undefined,
                                    });
                                  }}
                                  className={`flex-shrink-0 rounded p-1 transition-colors ${
                                    isPinned
                                      ? 'text-yellow-500 hover:bg-yellow-500/10'
                                      : 'text-[#2d333b] opacity-0 group-hover:opacity-100 hover:text-yellow-500/60 hover:bg-yellow-500/5'
                                  }`}
                                  title={isPinned ? 'Unpin repo' : 'Pin repo'}
                                >
                                  <Star className={`h-3 w-3 ${isPinned ? 'fill-current' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleCloneGhRepo(repo)}
                                  disabled={cloningGhUrl !== null}
                                  className="text-left min-w-0 flex-1"
                                >
                                  <span className="text-sm font-semibold text-[#cdd9e5] truncate block">
                                    {repo.name}
                                  </span>
                                </button>
                              </div>
                              <BranchPill
                                repoFullName={repo.full_name}
                                onClick={() => setExpandedRepo(isExpanded ? null : repo.full_name)}
                                isExpanded={isExpanded}
                              />
                            </div>

                            {/* Meta / status row */}
                            {isCloning ? (
                              <div className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1DD3E6] border-t-transparent" />
                                <span className="text-[11px] text-[#1DD3E6]">
                                  Cloning {branch}...
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {repo.language && (
                                  <span className="text-[11px] text-[#768390]">{repo.language}</span>
                                )}
                                {repo.language && repo.updated_at && (
                                  <span className="text-[11px] text-[#768390]">·</span>
                                )}
                                {repo.updated_at && (
                                  <span className="text-[11px] text-[#768390]">Updated {timeAgo(repo.updated_at)}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Cloning progress bar */}
                          {isCloning && (
                            <div className="h-[3px] w-full bg-[#1DD3E610] overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#1DD3E6] to-[#1DD3E680] animate-progress-indeterminate" />
                            </div>
                          )}

                          {/* Expanded branch picker */}
                          {isExpanded && !isCloning && (
                            <>
                              <div className="h-px w-full bg-gradient-to-r from-[#1DD3E600] via-[#1DD3E630] to-[#a371f700]" />
                              <div className="px-4 py-3">
                                <BranchPicker repoFullName={repo.full_name} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : ghSyncing ? (
              <div className="flex justify-center py-4">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 text-center py-3">
                No repos found. Click Sync to fetch.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-fade-up stagger-2">
            <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
              My Repos
            </h3>
            <button
              onClick={() => { window.location.href = githubApi.getAuthUrl(); }}
              className="glass-card w-full flex items-center gap-4 p-5 transition-all duration-300 hover:border-[#238636] hover:shadow-[0_0_20px_rgba(35,134,54,0.2)] active:scale-[0.98] group text-left"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#238636]/10 transition-all duration-200 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] group-hover:bg-[#238636]/20 group-hover:scale-110">
                <GithubLogo className="h-5 w-5 text-[#e6edf3] transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(35,134,54,0.8)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-bold uppercase tracking-wide">
                  Connect GitHub
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Import your repos for one-click sessions
                </p>
              </div>
              <svg className="h-4 w-4 text-muted-foreground/50 group-hover:text-[#238636] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Error display */}
        {createError && (
          <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error animate-fade-up">
            {createError}
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
                    className="glass-card group flex w-full min-w-0 items-center justify-between p-4 md:p-5 opacity-60 border-red-500/20 transition-all duration-300 hover:opacity-80"
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
        <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground/50 font-mono animate-fade-up stagger-3">
          <span>v{APP_VERSION}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>#{BUILD_HASH}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{BUILD_DATE}</span>
        </div>
        <Changelog />

        {/* Powered by logos */}
        <div className="flex items-center justify-center gap-6 animate-fade-up stagger-4">
          <span className="text-[10px] tracking-widest uppercase text-muted-foreground/40 font-display">
            Powered by
          </span>
          {[
            { Logo: CloudflareLogo, label: 'Cloudflare' },
            { Logo: AnthropicLogo, label: 'Anthropic' },
            { Logo: ReactLogo, label: 'React' },
            { Logo: GithubLogo, label: 'GitHub' },
          ].map(({ Logo, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity"
              title={label}
            >
              <Logo className="h-4 w-4" />
              <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}
