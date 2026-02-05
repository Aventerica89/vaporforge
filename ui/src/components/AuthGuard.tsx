import { useState } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import {
  Key,
  LogIn,
  AlertCircle,
  ExternalLink,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';

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
    oauthFlow,
    startOAuth,
    submitOAuthCode,
    cancelOAuth,
  } = useAuthStore();

  const [apiKey, setApiKey] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      await loginWithApiKey(apiKey.trim());
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authCode.trim()) {
      await submitOAuthCode(authCode.trim());
    }
  };

  const copyUrl = async () => {
    if (oauthFlow.step === 'has_url' || oauthFlow.step === 'waiting_code') {
      await navigator.clipboard.writeText(oauthFlow.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openAuthUrl = () => {
    if (oauthFlow.step === 'has_url' || oauthFlow.step === 'waiting_code') {
      window.open(oauthFlow.url, '_blank');
    }
  };

  // Render OAuth URL and code input
  const renderOAuthFlow = () => {
    if (oauthFlow.step === 'starting' || oauthFlow.step === 'waiting_url') {
      const debugInfo = oauthFlow.step === 'waiting_url' ? oauthFlow.debug : undefined;
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Initializing Claude login...</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            This may take a few seconds
          </p>
          {debugInfo && (
            <details className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Debug Info
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {debugInfo}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={cancelOAuth}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      );
    }

    if (
      oauthFlow.step === 'has_url' ||
      oauthFlow.step === 'waiting_code' ||
      oauthFlow.step === 'submitting'
    ) {
      const isSubmitting = oauthFlow.step === 'submitting';

      return (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="mb-2 text-sm font-medium">Step 1: Open Claude Login</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openAuthUrl}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="h-4 w-4" />
                Open Claude.ai
              </button>
              <button
                type="button"
                onClick={copyUrl}
                className="flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="mb-2 text-sm font-medium">Step 2: Paste Auth Code</p>
            <form onSubmit={handleCodeSubmit} className="space-y-2">
              <input
                type="text"
                value={authCode}
                onChange={(e) => {
                  setAuthCode(e.target.value);
                  clearError();
                }}
                placeholder="XXX#YYY"
                className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={isSubmitting}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                After signing in on Claude.ai, you'll receive a code in the
                format XXX#YYY. Paste it above.
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !authCode.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Complete Login
              </button>
            </form>
          </div>

          <button
            type="button"
            onClick={cancelOAuth}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel and use API key instead
          </button>
        </div>
      );
    }

    if (oauthFlow.step === 'error') {
      return (
        <div className="space-y-4">
          <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {oauthFlow.message}
            </div>
            {oauthFlow.debug && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs opacity-70">
                  Debug Info
                </summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs opacity-70">
                  {oauthFlow.debug}
                </pre>
              </details>
            )}
          </div>
          <button
            type="button"
            onClick={() => startOAuth()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={cancelOAuth}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Use API key instead
          </button>
        </div>
      );
    }

    return null;
  };

  // Check if we're in OAuth flow
  const inOAuthFlow = oauthFlow.step !== 'idle';

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

        {inOAuthFlow ? (
          renderOAuthFlow()
        ) : (
          <>
            {/* OAuth Button - Primary */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => startOAuth()}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Connect with Claude Pro/Max
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Use your existing Claude subscription
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or use API key
                </span>
              </div>
            </div>

            {/* API Key Form - Secondary */}
            <div>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? 'Hide API key form' : 'Show API key form'}
              </button>

              {showApiKey && (
                <form onSubmit={handleApiKeySubmit} className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="apiKey"
                      className="block text-sm font-medium text-foreground"
                    >
                      Claude API Key
                    </label>
                    <input
                      type="password"
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        clearError();
                      }}
                      placeholder="sk-ant-..."
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Get your API key from{' '}
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        console.anthropic.com
                      </a>
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !apiKey.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4" />
                    )}
                    Sign In with API Key
                  </button>
                </form>
              )}
            </div>
          </>
        )}

        {error && !inOAuthFlow && (
          <div className="flex items-center gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
