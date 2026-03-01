import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { STATUS_CONFIG, TRANSPORT_BADGE } from './types';
import type { McpServerConfig } from '@/lib/types';

interface McpDetailProps {
  server: McpServerConfig;
}

export function McpDetail({ server }: McpDetailProps) {
  const {
    mcpStatuses,
    toggleMcp,
    confirmRemove,
    setConfirmRemove,
    removeMcp,
  } = useIntegrationsStore();

  const status = !server.enabled
    ? 'disabled'
    : mcpStatuses[server.name] || 'disabled';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.disabled;
  const transportClass = TRANSPORT_BADGE[server.transport] || TRANSPORT_BADGE.http;
  const isRemoving = confirmRemove === server.name;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6">
      {/* Top row */}
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[17px] font-bold text-foreground">
          {server.name}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] text-red-500 transition-all ${
              isRemoving
                ? 'border border-red-500 bg-red-500/15'
                : 'border border-transparent hover:border-red-500 hover:bg-red-500/10'
            }`}
            onClick={() => {
              if (isRemoving) {
                removeMcp(server.name);
              } else {
                setConfirmRemove(server.name);
              }
            }}
          >
            {isRemoving ? 'confirm?' : 'remove'}
          </button>
          <button
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              server.enabled ? 'bg-violet-500' : 'bg-muted-foreground/30'
            }`}
            onClick={() => toggleMcp(server.name)}
          >
            <span
              className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
                server.enabled ? 'left-[15px]' : 'left-[3px]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="mb-2.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
        <span className="w-[72px] shrink-0">Status</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[9px] ${
            status === 'connected'
              ? 'border-green-500/35 bg-green-500/10 text-green-500'
              : status === 'error'
                ? 'border-red-500/35 bg-red-500/10 text-red-500'
                : 'border-border bg-card text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.label}
        </span>
      </div>

      {/* Transport */}
      <div className="mb-2.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
        <span className="w-[72px] shrink-0">Transport</span>
        <span
          className={`inline-block rounded-sm border px-2 py-0.5 text-[9px] ${transportClass}`}
        >
          {server.transport}
        </span>
      </div>

      {/* URL / Command */}
      {server.url && (
        <div className="mb-2.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <span className="w-[72px] shrink-0">URL</span>
          <span className="min-w-0 truncate font-mono text-[10px] text-foreground">
            {server.url}
          </span>
        </div>
      )}
      {server.command && (
        <div className="mb-2.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <span className="w-[72px] shrink-0">Command</span>
          <span className="min-w-0 truncate font-mono text-[10px] text-foreground">
            {server.command} {server.args?.join(' ')}
          </span>
        </div>
      )}

      <hr className="my-4 border-border/40" />

      {/* Tools */}
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
        Available Tools ({server.tools?.length || server.toolCount || 0})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {server.tools && server.tools.length > 0 ? (
          server.tools.map((tool) => (
            <span
              key={tool}
              className="inline-block rounded-sm border border-border bg-card px-2 py-0.5 text-[9px] text-muted-foreground"
            >
              {tool}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-muted-foreground/40">
            {server.enabled
              ? 'Ping server to discover tools'
              : 'Enable server to discover tools'}
          </span>
        )}
      </div>

      {/* Added date */}
      {server.addedAt && (
        <div className="mt-6 text-[9px] text-muted-foreground/40">
          Added {new Date(server.addedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
