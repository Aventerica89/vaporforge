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
      aria-label="Copy command to clipboard"
      className="group flex w-full items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-5 py-4 text-left font-mono text-base transition-colors hover:border-primary/40 hover:bg-primary/10 active:scale-[0.98]"
    >
      <span>
        <span className="text-primary/50">$ </span>
        <span className="text-foreground font-medium">{command}</span>
      </span>
      <span className="relative size-5 flex-shrink-0">
        <Check
          className={`absolute inset-0 size-5 text-emerald-400 transition-opacity duration-200 ${copied ? 'opacity-100' : 'opacity-0'}`}
        />
        <Copy
          className={`absolute inset-0 size-5 text-primary/40 transition-opacity duration-200 group-hover:text-primary/70 ${copied ? 'opacity-0' : 'opacity-100'}`}
        />
      </span>
    </button>
  );
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, login, error, isLoading, clearError } = useAuthStore();
  const [token, setToken] = useState('');

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-4 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary">
            <Terminal className="size-6 text-primary-foreground" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-balance">
            Link your Claude account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Connect your Claude Pro or Max subscription to start coding
          </p>
        </div>

        {/* Step 1 — the hero action */}
        <div className="mt-10">
          <p className="mb-2.5 text-xs font-medium uppercase text-muted-foreground/60">
            Step 1 — Run in your terminal
          </p>
          <CommandSnippet command="claude setup-token" />
        </div>

        {/* Step 2 — paste token */}
        <div className="mt-8">
          <p className="mb-2.5 text-xs font-medium uppercase text-muted-foreground/60">
            Step 2 — Paste your token
          </p>
          <input
            type="password"
            id="token"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              clearError();
            }}
            placeholder="sk-ant-oat01-..."
            className="block w-full min-h-[44px] rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-base placeholder:text-muted-foreground/30 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            autoComplete="off"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={() => { if (token.trim()) login(token.trim()); }}
          disabled={isLoading || !token.trim()}
          className="mt-8 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          Link Account
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
            <AlertCircle className="size-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
