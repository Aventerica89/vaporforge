import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { STATUS_CONFIG } from './types';
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
  const isRemoving = confirmRemove === server.name;
  const toolCount = server.toolSchemas?.length || server.tools?.length || server.toolCount || 0;
  const allToolNames = server.toolSchemas?.map((t) => t.name) || server.tools || [];

  return (
    <div className="flex flex-1 flex-col gap-[20px] min-h-0 overflow-y-auto px-[40px] py-[32px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-['Space_Mono'] text-[18px] font-semibold text-[#cdd9e5]">
          {server.name}
        </span>
        <div className="flex items-center gap-3">
          <button
            className={`rounded-[4px] px-[7px] py-[2px] font-['Space_Mono'] text-[12px] font-medium transition-all ${
              isRemoving
                ? 'border border-[#f8514933] bg-[#f851490a] text-[#ef4444]'
                : 'border border-[#f8514933] bg-[#f851490a] text-[#ef4444] hover:bg-[#f8514933]'
            }`}
            onClick={() => {
              if (isRemoving) {
                removeMcp(server.name);
              } else {
                setConfirmRemove(server.name);
              }
            }}
          >
            {isRemoving ? 'Confirm?' : 'Remove'}
          </button>
          <button
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              server.enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
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

      {/* Status Row */}
      <div className="flex items-center gap-[12px]">
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Status</span>
        <span className={`h-[7px] w-[7px] rounded-full ${statusCfg.dot} ${
          status === 'connected' ? 'shadow-[0_0_4px_#3fb950]' : status === 'error' ? 'shadow-[0_0_4px_#f85149]' : ''
        }`} />
        <span className={`font-['Space_Mono'] text-[11px] font-semibold ${
          status === 'connected' ? 'text-[#3fb950]' : status === 'error' ? 'text-[#f85149]' : 'text-[#768390]'
        }`}>
          {statusCfg.label}
        </span>
        {server.lastPingMs != null && status === 'connected' && (
          <span className="font-['Space_Mono'] text-[10px] text-[#8b949e]">
            ping: {server.lastPingMs}ms
          </span>
        )}
      </div>

      {/* Transport Row */}
      <div className="flex items-center gap-[10px]">
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Transport</span>
        <span className="rounded-[3px] border border-[#a371f733] bg-[#a371f70a] px-[10px] py-[4px] font-['Space_Mono'] text-[9px] font-bold text-[#a371f7]">
          {server.transport}
        </span>
      </div>

      {/* URL / Command Row */}
      {server.url && (
        <div className="flex items-center gap-[10px]">
          <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">URL</span>
          <span className="min-w-0 truncate font-['Space_Mono'] text-[11px] text-[#cdd9e5]">
            {server.url}
          </span>
        </div>
      )}
      {server.command && (
        <div className="flex items-center gap-[10px]">
          <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Command</span>
          <span className="min-w-0 truncate font-['Space_Mono'] text-[11px] text-[#cdd9e5]">
            {server.command} {server.args?.join(' ')}
          </span>
        </div>
      )}

      {/* Mode Section */}
      <div>
        <div className="mb-[6px] font-['Space_Mono'] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#4b535d]">
          Mode
        </div>
        <div className="flex flex-wrap gap-[8px]">
          {(['always', 'on-demand', 'auto'] as const).map((m) => {
            const activeMode = server.mode || 'always';
            return (
              <span
                key={m}
                className={`rounded-full border px-2.5 py-[3px] font-['Space_Mono'] text-[10px] ${
                  activeMode === m
                    ? 'border-[#a371f747] bg-[#a371f71a] text-[#a371f7]'
                    : 'border-[#30363d] text-[#768390]'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scope Section */}
      <div>
        <div className="mb-[6px] font-['Space_Mono'] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#4b535d]">
          Scope
        </div>
        <div className="mb-[6px] flex flex-wrap gap-[8px]">
          <span className="rounded-full border border-[#a371f747] bg-[#a371f71a] px-2.5 py-[3px] font-['Space_Mono'] text-[10px] text-[#a371f7]">
            Global
          </span>
          <span className="rounded-full border border-[#30363d] px-2.5 py-[3px] font-['Space_Mono'] text-[10px] text-[#768390]">
            This Repo
          </span>
        </div>
        <p className="font-['Space_Mono'] text-[9px] text-[#8b949e]">
          MCP will only activate when working in this scope
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#21262d]" />

      {/* Tools Section */}
      <div>
        <div className="mb-[16px] font-['Space_Mono'] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#cdd9e5]">
          Available Tools ({toolCount})
        </div>

        {allToolNames.length > 0 ? (
          <div className="flex flex-wrap gap-[5px]">
            {allToolNames.map((toolName) => (
              <span
                key={toolName}
                className="rounded-[3px] border border-[#30363d] bg-[#1c2128] px-2 py-[2px] font-['Space_Mono'] text-[9px] text-[#768390]"
              >
                {toolName}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-['Space_Mono'] text-[11px] text-[#768390]/40">
            {server.enabled
              ? 'Ping server to discover tools'
              : 'Enable server to discover tools'}
          </span>
        )}
      </div>

      {/* Added date */}
      {server.addedAt && (
        <div className="font-['Space_Mono'] text-[11px] text-[#8b949e] opacity-60">
          Added {new Date(server.addedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      )}
    </div>
  );
}
