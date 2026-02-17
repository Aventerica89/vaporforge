import { useEffect, useState } from 'react';
import { X, Plus, Globe, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import type { AgencySite } from '@/hooks/useAgencyStore';

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

function NewSiteModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; repoUrl: string; pagesUrl?: string; domain?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [pagesUrl, setPagesUrl] = useState('');
  const [domain, setDomain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
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
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Agency Site</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
      </div>
    </div>
  );
}
