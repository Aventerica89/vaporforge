import { useState, useCallback } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import { LogIn, AlertCircle, Loader2, Terminal, Copy, Check } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

/** Copy-to-clipboard snippet for terminal commands. */
function CommandSnippet({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command]);

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center justify-between rounded-lg border border-border/50 bg-black/40 px-4 py-3 text-left font-mono text-sm transition-all hover:border-border hover:bg-black/60"
    >
      <span>
        <span className="text-muted-foreground/60">$ </span>
        <span className="text-foreground">{command}</span>
      </span>
      {copied ? (
        <Check className="h-4 w-4 flex-shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, login, error, isLoading, clearError } = useAuthStore();
  const [token, setToken] = useState('');

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      await login(token.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-4 safe-top safe-bottom">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Terminal className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Link your Claude account</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Connect your Claude Pro or Max subscription
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Step 1 — Run in your terminal</p>
          <CommandSnippet command="claude setup-token" />

          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Step 2 — Paste your token</p>
          <input
            type="password"
            id="token"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              clearError();
            }}
            placeholder="sk-ant-oat01-..."
            className="block w-full rounded-lg border border-border/50 bg-black/40 px-4 py-3 font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            style={{ fontSize: '16px' }}
            autoComplete="off"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); if (token.trim()) login(token.trim()); }}
          disabled={isLoading || !token.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: '44px' }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          Link Account
        </button>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
