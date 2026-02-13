import { useState } from 'react';
import { User, LogOut, Shield, Clock, RotateCcw, Copy, Check } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';
import { authApi } from '@/lib/api';

export function AccountTab() {
  const { user, logout } = useAuthStore();
  const currentUserId = localStorage.getItem('vf-user-id') || user?.id || '';

  const [oldUserId, setOldUserId] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState<{ recovered: number } | null>(null);
  const [recoverError, setRecoverError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRecover = async () => {
    const trimmed = oldUserId.trim();
    if (!trimmed) return;
    setRecovering(true);
    setRecoverResult(null);
    setRecoverError('');
    try {
      const result = await authApi.recover(trimmed);
      setRecoverResult(result);
      setOldUserId('');
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setRecovering(false);
    }
  };

  const copyUserId = async () => {
    if (!currentUserId) return;
    await navigator.clipboard.writeText(currentUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <User className="h-4 w-4 text-primary" />
          Account
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage your session and authentication.
        </p>
      </section>

      {/* Profile card */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            U
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {user?.email || 'Claude User'}
            </p>
            <p className="text-xs text-muted-foreground">
              Authenticated via setup-token
            </p>
          </div>
        </div>

        {currentUserId && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate flex-1">
              ID: {currentUserId}
            </span>
            <button
              onClick={copyUserId}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              title="Copy user ID"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span>Session active</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Token refreshed automatically</span>
          </div>
        </div>
      </div>

      {/* Data Recovery */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <RotateCcw className="h-4 w-4 text-primary" />
          Data Recovery
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          If you lost data (issues, secrets, plugins, etc.) after re-authenticating
          with a new token, enter your previous user ID to recover it.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={oldUserId}
            onChange={(e) => { setOldUserId(e.target.value); setRecoverError(''); setRecoverResult(null); }}
            placeholder="user_abc123..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleRecover}
            disabled={recovering || !oldUserId.trim()}
            className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/30 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${recovering ? 'animate-spin' : ''}`} />
            {recovering ? 'Recovering...' : 'Recover'}
          </button>
        </div>
        {recoverResult && (
          <p className="text-xs text-success">
            Recovered {recoverResult.recovered} data {recoverResult.recovered === 1 ? 'item' : 'items'}.
            {recoverResult.recovered > 0 ? ' Refresh the page to see your data.' : ' No orphaned data found for that ID.'}
          </p>
        )}
        {recoverError && (
          <p className="text-xs text-red-400">{recoverError}</p>
        )}
      </div>

      {/* Auth method explainer */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">
          Authentication
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          VaporForge authenticates using your Claude Pro/Max subscription via
          the <code className="text-primary">setup-token</code> flow. Your
          token is stored securely per-user and refreshed server-side.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          To re-authenticate, sign out and run{' '}
          <code className="text-primary">claude setup-token</code>{' '}
          in your local terminal.
        </p>
      </div>

      {/* Sign out */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:border-red-500/50"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          This will clear your session token and return to the login screen.
        </p>
      </div>
    </div>
  );
}
