import { useEffect, useState, useCallback } from 'react';
import { X, Plus, Globe, ExternalLink, Pencil, Trash2, Github, Search, RefreshCw } from 'lucide-react';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import type { AgencySite } from '@/hooks/useAgencyStore';

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  updated_at: string;
  fork: boolean;
}

const STATUS_STYLES: Record<AgencySite['status'], { bg: string; text: string; label: string }> = {
  live: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Live' },
  staging: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Staging' },
  building: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Building' },
};

export function AgencyDashboard() {
  const { sites, isLoading, error, fetchSites, closeDashboard, openEditor, deleteSite, createSite } =
    useAgencyStore();
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNewForm) {
          setShowNewForm(false);
        } else {
          closeDashboard();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDashboard, showNewForm]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <h1 className="font-display text-lg font-semibold">Agency Sites</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {sites.length} site{sites.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Site
          </button>
          <button
            onClick={closeDashboard}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Close dashboard"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <EmptyState onAdd={() => setShowNewForm(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onEdit={() => openEditor(site.id)}
                onDelete={() => deleteSite(site.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Site Modal */}
      {showNewForm && (
        <NewSiteModal
          onClose={() => setShowNewForm(false)}
          onCreate={async (data) => {
            await createSite(data);
            setShowNewForm(false);
          }}
        />
      )}
    </div>
  );
}

function SiteCard({
  site,
  onEdit,
  onDelete,
}: {
  site: AgencySite;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_STYLES[site.status];
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30">
      {/* Thumbnail placeholder */}
      <div className="mb-3 flex h-28 items-center justify-center rounded-md bg-muted/50">
        {site.thumbnail ? (
          <img src={site.thumbnail} alt={site.name} className="h-full w-full rounded-md object-cover" />
        ) : (
          <Globe className="h-8 w-8 text-muted-foreground/30" />
        )}
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{site.name}</h3>
          {site.domain && (
            <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </div>

      {site.lastEdited && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Edited {new Date(site.lastEdited).toLocaleDateString()}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>

        {site.pagesUrl && (
          <a
            href={site.pagesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </a>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              className="rounded-md bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Delete site"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Globe className="mb-4 h-12 w-12 text-muted-foreground/20" />
      <h2 className="text-lg font-semibold">No agency sites yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first client site to start editing with AI.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Add Site
      </button>
    </div>
  );
}

function isAstroRepo(repo: GitHubRepo): boolean {
  if (repo.language?.toLowerCase() === 'astro') return true;
  const text = `${repo.name} ${repo.description ?? ''}`.toLowerCase();
  return text.includes('astro');
}

function repoDisplayName(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function NewSiteModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; repoUrl: string; pagesUrl?: string; domain?: string }) => Promise<void>;
}) {
  const [tab, setTab] = useState<'github' | 'manual'>('github');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Manual tab state
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [pagesUrl, setPagesUrl] = useState('');
  const [domain, setDomain] = useState('');

  // GitHub tab state
  const [githubUsername, setGithubUsername] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [astroOnly, setAstroOnly] = useState(true);

  const token = localStorage.getItem('session_token');

  const loadRepos = useCallback(
    async (username: string, forceRefresh = false) => {
      const trimmed = username.trim();
      if (!trimmed) return;
      setReposLoading(true);
      setReposError('');
      try {
        const endpoint = forceRefresh ? '/api/github/repos/sync' : `/api/github/repos?username=${encodeURIComponent(trimmed)}`;
        const res = forceRefresh
          ? await fetch(endpoint, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: trimmed }),
            })
          : await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load repos');
        setRepos(json.data.repos ?? []);
        // Persist username for future sessions
        await fetch('/api/github/username', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
      } catch (err) {
        setReposError(err instanceof Error ? err.message : 'Failed to load repos');
      } finally {
        setReposLoading(false);
      }
    },
    [token],
  );

  // Load saved username + repos on mount
  useEffect(() => {
    fetch('/api/github/username', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        const saved = json.data?.username ?? '';
        if (saved) {
          setGithubUsername(saved);
          loadRepos(saved);
        }
      })
      .catch(() => {});
  }, [token, loadRepos]);

  const filteredRepos = repos
    .filter((r) => !r.fork)
    .filter((r) => !astroOnly || isAstroRepo(r))
    .filter((r) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q);
    });

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setIsSubmitting(true);
    setError('');
    try {
      await onCreate({ name: repoDisplayName(repo.name), repoUrl: repo.html_url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site');
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoUrl.trim()) return;
    setIsSubmitting(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        repoUrl: repoUrl.trim(),
        pagesUrl: pagesUrl.trim() || undefined,
        domain: domain.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">New Agency Site</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-border">
          <button
            onClick={() => setTab('github')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'github'
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Github className="h-3.5 w-3.5" />
            From GitHub
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'manual'
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Manual
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 shrink-0 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* GitHub Tab */}
        {tab === 'github' && (
          <div className="flex min-h-0 flex-col p-4">
            {/* Username + load */}
            <div className="mb-3 flex gap-2 shrink-0">
              <div className="relative flex-1">
                <Github className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadRepos(githubUsername); }}
                  placeholder="GitHub username"
                  className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={() => loadRepos(githubUsername)}
                disabled={!githubUsername.trim() || reposLoading}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5" />
                Load
              </button>
            </div>

            {/* Filter row */}
            {repos.length > 0 && (
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter repos..."
                    className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={astroOnly}
                    onChange={(e) => setAstroOnly(e.target.checked)}
                    className="accent-primary"
                  />
                  Astro only
                </label>
                <button
                  onClick={() => loadRepos(githubUsername, true)}
                  disabled={reposLoading}
                  title="Refresh repos"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reposLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}

            {/* Repo list */}
            <div className="flex-1 overflow-y-auto">
              {reposLoading && repos.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                  Loading repos...
                </div>
              ) : reposError ? (
                <div className="py-6 text-center text-xs text-red-400">{reposError}</div>
              ) : repos.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Enter a GitHub username and click Load to browse repos.
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No repos match — try disabling "Astro only" or clearing the filter.
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredRepos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo)}
                      disabled={isSubmitting}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{repo.name}</p>
                        {repo.description && (
                          <p className="truncate text-[11px] text-muted-foreground">{repo.description}</p>
                        )}
                      </div>
                      {repo.language && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {repo.language}
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(repo.updated_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex shrink-0 justify-end border-t border-border pt-3">
              <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Manual Tab */}
        {tab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-3 overflow-y-auto p-5">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Site Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Client Site"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
                maxLength={100}
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Repository URL</span>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Pages URL <span className="text-muted-foreground/50">(optional)</span>
              </span>
              <input
                type="url"
                value={pagesUrl}
                onChange={(e) => setPagesUrl(e.target.value)}
                placeholder="https://client-site.pages.dev"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Custom Domain <span className="text-muted-foreground/50">(optional)</span>
              </span>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="client-site.com"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                maxLength={253}
              />
            </label>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || !repoUrl.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Site'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
