import { useState, useEffect } from 'react';
import { Star, Search, X } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useFavoritesStore, type FavoriteRepo } from '@/hooks/useFavorites';

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  fork: boolean;
}

type Tab = 'url' | 'favorites' | 'github';

interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloneRepoModal({ isOpen, onClose }: CloneRepoModalProps) {
  const { favorites, recents, toggleFavorite, addRecent, isFavorite } =
    useFavoritesStore();
  const { createSession, selectSession } = useSandboxStore();

  const [activeTab, setActiveTab] = useState<Tab>('url');

  // URL tab state
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState('');

  // GitHub tab state
  const [ghUsername, setGhUsername] = useState('');
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ghError, setGhError] = useState('');

  // Load saved GitHub username
  useEffect(() => {
    const saved = localStorage.getItem('vf_gh_username');
    if (saved) setGhUsername(saved);
  }, []);

  // Set default tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(favorites.length > 0 ? 'favorites' : 'url');
      setError('');
      setGhError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return url.match(/^[\w-]+\/[\w.-]+$/) !== null;
    }
  };

  const normalizeUrl = (url: string): string => {
    const trimmed = url.trim();
    return trimmed.includes('://') ? trimmed : `https://github.com/${trimmed}`;
  };

  const parseRepoInfo = (
    url: string
  ): { owner: string; name: string } | null => {
    const match = url.match(/github\.com\/([^/]+)\/([^/.\s]+)/);
    if (match) return { owner: match[1], name: match[2] };
    const shorthand = url.match(/^([\w-]+)\/([\w.-]+)$/);
    if (shorthand) return { owner: shorthand[1], name: shorthand[2] };
    return null;
  };

  const handleClone = async (url?: string, cloneBranch?: string) => {
    const targetUrl = url || repoUrl.trim();
    const targetBranch = cloneBranch || branch.trim();

    if (!targetUrl) {
      setError('Repository URL is required');
      return;
    }

    if (!isValidUrl(targetUrl)) {
      setError('Enter a valid URL or owner/repo shorthand');
      return;
    }

    const fullUrl = normalizeUrl(targetUrl);

    setIsCloning(true);
    setError('');

    try {
      const session = await createSession(
        undefined,
        fullUrl,
        targetBranch || undefined
      );
      if (!session) {
        setError('Failed to create session');
        return;
      }

      // Save to recents
      const info = parseRepoInfo(fullUrl);
      if (info) {
        addRecent({ url: fullUrl, name: info.name, owner: info.owner });
      }

      await selectSession(session.id);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setIsCloning(false);
    }
  };

  const handleClose = () => {
    setRepoUrl('');
    setBranch('');
    setError('');
    setIsCloning(false);
    onClose();
  };

  const searchGitHub = async () => {
    const username = ghUsername.trim();
    if (!username) {
      setGhError('Enter a GitHub username or organization');
      return;
    }

    setIsSearching(true);
    setGhError('');
    setGhRepos([]);
    localStorage.setItem('vf_gh_username', username);

    try {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=50`
      );

      if (res.status === 404) {
        setGhError(`User "${username}" not found`);
        return;
      }
      if (res.status === 403) {
        setGhError('GitHub API rate limit reached. Try again later.');
        return;
      }
      if (!res.ok) {
        setGhError('Failed to fetch repositories');
        return;
      }

      const repos: GitHubRepo[] = await res.json();
      setGhRepos(repos);
    } catch {
      setGhError('Network error — could not reach GitHub');
    } finally {
      setIsSearching(false);
    }
  };

  const toFavoriteRepo = (ghRepo: GitHubRepo): FavoriteRepo => ({
    url: ghRepo.html_url,
    name: ghRepo.name,
    owner: ghRepo.full_name.split('/')[0],
    description: ghRepo.description || undefined,
  });

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'url', label: 'URL' },
    { id: 'favorites', label: `Favorites${favorites.length > 0 ? ` (${favorites.length})` : ''}` },
    { id: 'github', label: 'GitHub' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4 safe-top safe-bottom"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="glass-card relative w-full max-w-lg p-4 sm:p-6 space-y-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-primary">
            Clone Repository
          </h2>
          <button
            onClick={handleClose}
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full hover:bg-accent hover:text-foreground transition-colors text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-display font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px]">
          {activeTab === 'url' && (
            <UrlTab
              repoUrl={repoUrl}
              setRepoUrl={setRepoUrl}
              branch={branch}
              setBranch={setBranch}
              error={error}
              setError={setError}
              isCloning={isCloning}
              onClone={() => handleClone()}
              onClose={handleClose}
              recents={recents}
              onCloneRecent={(repo) => handleClone(repo.url)}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesTab
              favorites={favorites}
              isCloning={isCloning}
              error={error}
              onClone={(repo) => handleClone(repo.url)}
              onRemove={(url) => toggleFavorite({ url, name: '', owner: '' })}
            />
          )}

          {activeTab === 'github' && (
            <GitHubTab
              username={ghUsername}
              setUsername={setGhUsername}
              repos={ghRepos}
              isSearching={isSearching}
              error={ghError}
              isCloning={isCloning}
              cloneError={error}
              onSearch={searchGitHub}
              onClone={(repo) => handleClone(repo.html_url)}
              onToggleFavorite={(repo) => toggleFavorite(toFavoriteRepo(repo))}
              isFavorite={(url) => isFavorite(url)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── URL Tab ──────────────────────────────────────────── */

function UrlTab({
  repoUrl,
  setRepoUrl,
  branch,
  setBranch,
  error,
  setError,
  isCloning,
  onClone,
  onClose,
  recents,
  onCloneRecent,
}: {
  repoUrl: string;
  setRepoUrl: (v: string) => void;
  branch: string;
  setBranch: (v: string) => void;
  error: string;
  setError: (v: string) => void;
  isCloning: boolean;
  onClone: () => void;
  onClose: () => void;
  recents: FavoriteRepo[];
  onCloneRecent: (repo: FavoriteRepo) => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCloning) onClone();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <div className="space-y-2">
        <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          Repository URL
        </label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => {
            setRepoUrl(e.target.value);
            setError('');
          }}
          placeholder="https://github.com/user/repo or user/repo"
          className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          autoFocus
          disabled={isCloning}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          Branch
          <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/60">
            (optional)
          </span>
        </label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          disabled={isCloning}
        />
      </div>

      {error && <p className="text-sm text-error animate-fade-up">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button onClick={onClose} disabled={isCloning} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          onClick={onClone}
          disabled={isCloning || !repoUrl.trim()}
          className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isCloning ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Cloning...
            </>
          ) : (
            'Clone'
          )}
        </button>
      </div>

      {/* Recent repos */}
      {recents.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <span className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
            Recent
          </span>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {recents.slice(0, 5).map((repo) => (
              <button
                key={repo.url}
                onClick={() => onCloneRecent(repo)}
                disabled={isCloning}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <span className="font-mono text-muted-foreground">{repo.owner}/</span>
                <span className="font-mono font-semibold truncate">{repo.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Favorites Tab ────────────────────────────────────── */

function FavoritesTab({
  favorites,
  isCloning,
  error,
  onClone,
  onRemove,
}: {
  favorites: FavoriteRepo[];
  isCloning: boolean;
  error: string;
  onClone: (repo: FavoriteRepo) => void;
  onRemove: (url: string) => void;
}) {
  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
        <Star className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No favorites yet</p>
        <p className="text-xs text-muted-foreground/60">
          Star repos from the GitHub tab to add them here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-error animate-fade-up">{error}</p>}
      <div className="max-h-[300px] overflow-y-auto space-y-1">
        {favorites.map((repo) => (
          <div
            key={repo.url}
            className="group flex items-center justify-between rounded-lg px-3 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-semibold truncate">
                <span className="text-muted-foreground">{repo.owner}/</span>
                {repo.name}
              </p>
              {repo.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {repo.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button
                onClick={() => onRemove(repo.url)}
                className="rounded p-1.5 text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                title="Remove from favorites"
              >
                <Star className="h-3.5 w-3.5 fill-current" />
              </button>
              <button
                onClick={() => onClone(repo)}
                disabled={isCloning}
                className="rounded-md px-3 py-1 text-xs font-mono uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all disabled:opacity-50"
              >
                {isCloning ? '...' : 'Clone'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── GitHub Tab ───────────────────────────────────────── */

function GitHubTab({
  username,
  setUsername,
  repos,
  isSearching,
  error,
  isCloning,
  cloneError,
  onSearch,
  onClone,
  onToggleFavorite,
  isFavorite,
}: {
  username: string;
  setUsername: (v: string) => void;
  repos: GitHubRepo[];
  isSearching: boolean;
  error: string;
  isCloning: boolean;
  cloneError: string;
  onSearch: () => void;
  onClone: (repo: GitHubRepo) => void;
  onToggleFavorite: (repo: GitHubRepo) => void;
  isFavorite: (url: string) => boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder="GitHub username or org"
          className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          disabled={isSearching}
        />
        <button
          onClick={onSearch}
          disabled={isSearching || !username.trim()}
          className="btn-primary flex items-center gap-1.5 px-4 disabled:opacity-50"
        >
          {isSearching ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground/60">
        Browse public repos. Star repos to add them to your favorites.
      </p>

      {error && <p className="text-sm text-error animate-fade-up">{error}</p>}
      {cloneError && <p className="text-sm text-error animate-fade-up">{cloneError}</p>}

      {/* Results */}
      {repos.length > 0 && (
        <div className="max-h-[260px] overflow-y-auto space-y-1 -mx-1 px-1">
          {repos.map((repo) => {
            const starred = isFavorite(repo.html_url);
            return (
              <div
                key={repo.full_name}
                className="group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold truncate">
                      {repo.name}
                    </p>
                    {repo.fork && (
                      <span className="text-[10px] font-mono text-muted-foreground/50 uppercase">
                        fork
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {repo.language && (
                      <span className="text-[11px] text-muted-foreground">
                        {repo.language}
                      </span>
                    )}
                    {repo.stargazers_count > 0 && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <Star className="h-3 w-3" />
                        {repo.stargazers_count}
                      </span>
                    )}
                    {repo.description && (
                      <span className="text-[11px] text-muted-foreground/60 truncate">
                        {repo.description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={() => onToggleFavorite(repo)}
                    className={`rounded p-1.5 transition-colors ${
                      starred
                        ? 'text-yellow-500 hover:bg-yellow-500/10'
                        : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'
                    }`}
                    title={starred ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${starred ? 'fill-current' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => onClone(repo)}
                    disabled={isCloning}
                    className="rounded-md px-3 py-1 text-xs font-mono uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all disabled:opacity-50"
                  >
                    {isCloning ? '...' : 'Clone'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isSearching && repos.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
          <Search className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/60">
            Enter a GitHub username to browse their repositories
          </p>
        </div>
      )}
    </div>
  );
}
