import { useState } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import { LogIn, AlertCircle, Loader2, Terminal } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
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
          <h1 className="mt-4 text-2xl font-semibold">VaporForge</h1>
          <p className="mt-2 text-muted-foreground">
            Web-based Claude Code IDE
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
          <p className="font-medium">Get your token:</p>
          <p className="mt-1 text-muted-foreground">
            Run this command in your terminal:
          </p>
          <code className="mt-2 block rounded bg-background px-3 py-2 font-mono text-xs">
            claude setup-token
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            Copy the token and paste it below.
          </p>
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
              placeholder="Paste your token here"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ fontSize: '16px' }}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !token.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Sign In
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
