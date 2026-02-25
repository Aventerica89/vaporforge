import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { User, LogOut, Shield, Clock, RotateCcw, Copy, Check, ExternalLink, BarChart3 } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';
import { useSandboxStore } from '@/hooks/useSandbox';
import { authApi } from '@/lib/api';

const ANTHROPIC_USAGE_URL = 'https://console.anthropic.com/settings/usage';

function UsageSection() {
  const messagesById = useSandboxStore((s) => s.messagesById);

  const stats = useMemo(() => {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let messageCount = 0;
    let hasCost = false;

    for (const msg of Object.values(messagesById)) {
      if (msg.role !== 'assistant' || !msg.usage) continue;
      totalInput += msg.usage.inputTokens || 0;
      totalOutput += msg.usage.outputTokens || 0;
      if (msg.usage.costUsd !== undefined) {
        totalCost += msg.usage.costUsd;
        hasCost = true;
      }
      messageCount++;
    }

    return {
      totalInput,
      totalOutput,
      totalTokens: totalInput + totalOutput,
      totalCost: hasCost ? totalCost : undefined,
      messageCount,
    };
  }, [messagesById]);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          Session Usage
        </h4>
        <a
          href={ANTHROPIC_USAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20"
        >
          Anthropic Console
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {stats.messageCount === 0 ? (
        <p className="text-xs text-muted-foreground">
          No usage data yet. Send a message to start tracking.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Input
            </p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatTokens(stats.totalInput)}
            </p>
            <p className="text-[10px] text-muted-foreground">tokens</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Output
            </p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatTokens(stats.totalOutput)}
            </p>
            <p className="text-[10px] text-muted-foreground">tokens</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Messages
            </p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {stats.messageCount}
            </p>
            <p className="text-[10px] text-muted-foreground">responses</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cost
            </p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {stats.totalCost !== undefined
                ? `$${stats.totalCost < 0.01 ? stats.totalCost.toFixed(4) : stats.totalCost.toFixed(2)}`
                : '--'}
            </p>
            <p className="text-[10px] text-muted-foreground">this session</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Usage shown is for the current browser session only. Check the{' '}
        <a
          href={ANTHROPIC_USAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Anthropic Console
        </a>{' '}
        for full account usage and rate limits.
      </p>
    </div>
  );
}

export function AccountTab() {
  const { user, logout } = useAuthStore();
  const currentUserId = localStorage.getItem('vf-user-id') || user?.id || '';

  const [recoverInput, setRecoverInput] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState<{ recovered: number } | null>(null);
  const [recoverError, setRecoverError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRecover = async () => {
    const trimmed = recoverInput.trim();
    if (!trimmed) return;
    setRecovering(true);
    setRecoverResult(null);
    setRecoverError('');
    try {
      if (!trimmed.startsWith('sk-ant-')) {
        setRecoverError('Please enter a Claude token (starts with sk-ant-)');
        setRecovering(false);
        return;
      }
      const result = await authApi.recoverByToken(trimmed);
      setRecoverResult(result);
      setRecoverInput('');
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setRecovering(false);
    }
  };

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyUserId = async () => {
    if (!currentUserId) return;
    await navigator.clipboard.writeText(currentUserId);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleRecoverInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRecoverInput(e.target.value);
    setRecoverError('');
    setRecoverResult(null);
  }, []);

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <User className="h-4 w-4 text-primary" />
          Account
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage your session, usage, and authentication.
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

      {/* Usage */}
      <UsageSection />

      {/* Data Recovery */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <RotateCcw className="h-4 w-4 text-primary" />
          Data Recovery
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          If you lost data (issues, secrets, plugins, etc.) after re-authenticating,
          paste your <strong>previous Claude token</strong> (sk-ant-...) to recover it.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={recoverInput}
            onChange={handleRecoverInputChange}
            placeholder="sk-ant-oat01-..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleRecover}
            disabled={recovering || !recoverInput.trim()}
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
