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
      className="group mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left font-mono text-sm transition-colors hover:bg-muted"
    >
      <span>
        <span className="text-muted-foreground">$ </span>
        <span className="text-foreground">{command}</span>
      </span>
      {copied ? (
        <Check className="h-4 w-4 flex-shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
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
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Terminal className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Link your Claude account</h1>
          <p className="mt-2 text-muted-foreground">
            Connect your Claude Pro or Max subscription to start coding
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">1</span>
            <div className="text-sm">
              <p className="font-medium">Run this in your terminal</p>
              <CommandSnippet command="claude setup-token" />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">2</span>
            <p className="text-sm font-medium">Copy the token and paste it below</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-foreground"
            >
              Claude Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                clearError();
              }}
              placeholder="sk-ant-oat01-..."
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              style={{ fontSize: '16px' }}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
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
        </form>

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
