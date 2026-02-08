import { useState } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';

interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloneRepoModal({ isOpen, onClose }: CloneRepoModalProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState('');

  const { createSession, selectSession } = useSandboxStore();

  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return url.match(/^[\w-]+\/[\w.-]+$/) !== null;
    }
  };

  const handleClone = async () => {
    const trimmedUrl = repoUrl.trim();
    if (!trimmedUrl) {
      setError('Repository URL is required');
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      setError('Enter a valid URL or owner/repo shorthand');
      return;
    }

    // Expand GitHub shorthand (owner/repo -> full URL)
    const fullUrl = trimmedUrl.includes('://')
      ? trimmedUrl
      : `https://github.com/${trimmedUrl}`;

    setIsCloning(true);
    setError('');

    try {
      // createSession passes gitRepo + branch to the backend which clones via
      // sandbox.gitCheckout during sandbox creation — no separate clone needed
      const session = await createSession(
        undefined,
        fullUrl,
        branch.trim() || undefined
      );
      if (!session) {
        setError('Failed to create session');
        return;
      }

      // Select the session to load files
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCloning) {
      handleClone();
    }
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="glass-card relative w-full max-w-md p-6 space-y-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-primary">
            Clone Repository
          </h2>
          <p className="text-sm text-muted-foreground">
            Import a Git repository into a new workspace
          </p>
        </div>

        {/* Repo URL Input */}
        <div className="space-y-2">
          <label
            htmlFor="repo-url"
            className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground"
          >
            Repository URL
          </label>
          <input
            id="repo-url"
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

        {/* Branch Input */}
        <div className="space-y-2">
          <label
            htmlFor="branch"
            className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground"
          >
            Branch
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/60">
              (optional)
            </span>
          </label>
          <input
            id="branch"
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            disabled={isCloning}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-error animate-fade-up">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={isCloning}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
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
      </div>
    </div>
  );
}
