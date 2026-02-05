import { useState } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import { Key, AlertCircle, Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const {
    isAuthenticated,
    loginWithApiKey,
    error,
    isLoading,
    clearError,
  } = useAuthStore();

  const [apiKey, setApiKey] = useState('');

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      await loginWithApiKey(apiKey.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Key className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">VaporForge</h1>
          <p className="mt-2 text-muted-foreground">Web-based Claude Code IDE</p>
        </div>

        {/* API Key Form - Primary (Official Method) */}
        <form onSubmit={handleApiKeySubmit} className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-foreground"
            >
              Anthropic API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                clearError();
              }}
              placeholder="sk-ant-api03-..."
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Get your API key from the{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Anthropic Console
              </a>
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || !apiKey.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Key className="h-4 w-4" />
            )}
            Connect
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Your API key is stored securely and used to run Claude Code in isolated sandboxes.
          <br />
          <a
            href="https://developers.cloudflare.com/sandbox/tutorials/claude-code/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Learn more about the architecture
          </a>
        </p>

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
