import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Hammer,
  Globe,
  Monitor,
  Clock,
} from 'lucide-react';
import { DEV_BUILD } from '@/lib/dev-version';
import { APP_VERSION } from '@/lib/version';

interface ServerInfo {
  version: string;
  devBuild: number;
  timestamp: string;
}

export function DevToolsTab() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchServerInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json() as {
        success: boolean;
        data: ServerInfo;
      };
      if (data.success) {
        setServerInfo(data.data);
        setLastChecked(new Date().toLocaleTimeString());
      }
    } catch {
      // Silent fail — server might be down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerInfo();
  }, [fetchServerInfo]);

  const isStale =
    serverInfo != null && serverInfo.devBuild !== DEV_BUILD;
  const isSynced =
    serverInfo != null && serverInfo.devBuild === DEV_BUILD;

  const handleCopyBuildInfo = useCallback(() => {
    const info = [
      `App: ${APP_VERSION}`,
      `Client Build: ${DEV_BUILD}`,
      `Server Build: ${serverInfo?.devBuild ?? '?'}`,
      `Server Version: ${serverInfo?.version ?? '?'}`,
      `Status: ${isSynced ? 'Synced' : 'Stale — refresh needed'}`,
    ].join('\n');
    navigator.clipboard.writeText(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [serverInfo, isSynced]);

  return (
    <div className="space-y-6">
      {/* Build status card */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Build Status
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyBuildInfo}
              className="rounded p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Copy build info"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={fetchServerInfo}
              disabled={loading}
              className="rounded p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Status indicator */}
        {isSynced && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-xs font-medium text-green-400">
              Client and server are in sync
            </span>
          </div>
        )}

        {isStale && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">
              New build deployed — hard refresh to update
              (Cmd+Shift+R)
            </span>
          </div>
        )}

        {/* Build numbers grid */}
        <div className="grid grid-cols-2 gap-3">
          <BuildCard
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Client Build"
            value={String(DEV_BUILD)}
            sublabel={`v${APP_VERSION}`}
          />
          <BuildCard
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Server Build"
            value={
              serverInfo ? String(serverInfo.devBuild) : '...'
            }
            sublabel={
              serverInfo ? `v${serverInfo.version}` : 'loading'
            }
            highlight={isStale}
          />
        </div>

        {lastChecked && (
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground/60">
            <Clock className="h-2.5 w-2.5" />
            Last checked: {lastChecked}
          </div>
        )}
      </div>

      {/* Environment info */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Environment
        </h3>
        <div className="space-y-2 text-xs">
          <InfoRow label="Platform" value="Cloudflare Workers" />
          <InfoRow label="Runtime" value="Edge (V8 Isolate)" />
          <InfoRow
            label="Host"
            value={window.location.hostname}
          />
          <InfoRow
            label="Protocol"
            value={window.location.protocol.replace(':', '')}
          />
          <InfoRow
            label="User Agent"
            value={navigator.userAgent.slice(0, 80) + '...'}
            mono
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <DevButton
            label="Hard Refresh"
            onClick={() => window.location.reload()}
          />
          <DevButton
            label="Clear Storage"
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }}
          />
          <DevButton
            label="Copy Token"
            onClick={() => {
              const token =
                localStorage.getItem('session_token') || '';
              navigator.clipboard.writeText(token);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function BuildCard({
  icon,
  label,
  value,
  sublabel,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        highlight
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div
        className={`font-mono text-lg font-bold ${
          highlight ? 'text-amber-400' : 'text-foreground'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground/60">
        {sublabel}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={`text-right text-foreground ${
          mono ? 'font-mono text-[10px] leading-relaxed' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DevButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors"
    >
      {label}
    </button>
  );
}
