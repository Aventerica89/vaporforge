import { useState, useCallback } from 'react';
import {
  Copy,
  Check,
  Hammer,
  Monitor,
  GitCommitHorizontal,
} from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import { BUILD_HASH, BUILD_DATE, COMMIT_LOG } from '@/lib/generated/build-info';
import { useDevChangelog } from '@/hooks/useDevChangelog';
import { usePlayground } from '@/hooks/usePlayground';
import { useSettingsStore } from '@/hooks/useSettings';

export function DevToolsTab() {
  const [copied, setCopied] = useState(false);

  const handleCopyBuildInfo = useCallback(() => {
    const info = [
      `App: v${APP_VERSION}`,
      `Hash: ${BUILD_HASH}`,
      `Build Date: ${BUILD_DATE}`,
      `Commits: ${COMMIT_LOG.length}`,
      `Host: ${window.location.hostname}`,
    ].join('\n');
    navigator.clipboard.writeText(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="space-y-6">
      {/* Build info card */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Build Info
            </h3>
          </div>
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
        </div>

        {/* Build card */}
        <div className="rounded-md border border-border bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
            <Monitor className="h-3.5 w-3.5" />
            Build
          </div>
          <div className="font-mono text-lg font-bold text-foreground">
            #{BUILD_HASH}
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            v{APP_VERSION} | {BUILD_DATE} | {COMMIT_LOG.length} commits
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={() => {
              useDevChangelog.getState().openChangelog();
              useSettingsStore.getState().closeSettings();
            }}
            className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors"
          >
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            Dev Changelog
          </button>
        </div>
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

      {/* Dev Playground launcher */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-amber-400 mb-1">Dev Playground</h3>
            <p className="text-xs text-muted-foreground">
              Build UI components, browse the component catalog, view console logs, and track issues.
            </p>
          </div>
          <button
            onClick={() => {
              usePlayground.getState().openPlayground();
              useSettingsStore.getState().closeSettings();
            }}
            className="shrink-0 rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30 transition-colors"
          >
            Open
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Shortcut: Cmd+Shift+D
        </p>
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
          {process.env.NODE_ENV === 'development' && (
            <DevButton
              label="Copy Token (DEV)"
              onClick={() => {
                const token =
                  localStorage.getItem('session_token') || '';
                navigator.clipboard.writeText(token);
              }}
            />
          )}
        </div>
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
