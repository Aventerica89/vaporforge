import { useState } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { STATUS_CONFIG } from './types';
import { Toggle, RemoveButton, SectionHeader, PillGroup, Chevron } from './shared';
import type { McpServerConfig } from '@/lib/types';

interface McpDetailProps {
  server: McpServerConfig;
}

const MODE_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'on-demand', label: 'On-demand' },
  { value: 'auto', label: 'Auto' },
];

const SCOPE_OPTIONS = [
  { value: 'global', label: 'Global' },
  { value: 'project', label: 'This Repo' },
];

/** Extract credential env var names from server config */
function getCredentials(server: McpServerConfig): Array<{ key: string; masked: boolean }> {
  const creds: Array<{ key: string; masked: boolean }> = [];
  if (server.env) {
    for (const key of Object.keys(server.env)) {
      creds.push({ key, masked: true });
    }
  }
  if (server.headers) {
    for (const key of Object.keys(server.headers)) {
      creds.push({ key, masked: true });
    }
  }
  return creds;
}

export function McpDetail({ server }: McpDetailProps) {
  const {
    mcpStatuses,
    mcpModes,
    mcpScopes,
    toggleMcp,
    setMcpMode,
    setMcpScope,
    pingSingleMcp,
    confirmRemove,
    setConfirmRemove,
    removeMcp,
  } = useIntegrationsStore();

  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const status = !server.enabled
    ? 'disabled'
    : mcpStatuses[server.name] || 'disabled';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.disabled;
  const isRemoving = confirmRemove === server.name;
  const toolSchemas = server.toolSchemas || [];
  const toolNames = toolSchemas.map((t) => t.name) || server.tools || [];
  const toolCount = toolSchemas.length || server.tools?.length || server.toolCount || 0;
  const credentials = getCredentials(server);
  const hasAuth = credentials.length > 0 || (server.credentialFiles && server.credentialFiles.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-[20px] min-h-0 overflow-y-auto px-[40px] py-[32px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-['Space_Mono'] text-[18px] font-semibold text-white">
          {server.name}
        </span>
        <div className="flex items-center gap-[12px]">
          <RemoveButton
            isConfirming={isRemoving}
            onRemove={() => setConfirmRemove(server.name)}
            onConfirm={() => removeMcp(server.name)}
          />
          <Toggle
            enabled={server.enabled}
            onClick={(e) => { e.stopPropagation(); toggleMcp(server.name); }}
          />
        </div>
      </div>

      {/* Status Row */}
      <div className="flex items-center gap-[12px]">
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Status</span>
        <span
          className={`h-[7px] w-[7px] rounded-full ${statusCfg.dot}`}
          style={
            status === 'connected'
              ? { boxShadow: '0 0 4px #3fb950' }
              : status === 'error'
                ? { boxShadow: '0 0 4px #f85149' }
                : undefined
          }
        />
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
        <button
          className="ml-auto rounded-[4px] border border-[#30363d] bg-[#161b22] px-[10px] py-[3px] font-['Space_Mono'] text-[10px] text-[#8b949e] transition-colors hover:border-[#00e5ff33] hover:text-[#00e5ff] disabled:opacity-40"
          disabled={isPinging || !server.enabled}
          onClick={async () => {
            setIsPinging(true);
            await pingSingleMcp(server.name);
            setIsPinging(false);
          }}
        >
          {isPinging ? 'Pinging...' : 'Test Connection'}
        </button>
      </div>

      {/* Transport Row */}
      <div className="flex items-center gap-[10px]">
        <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Transport</span>
        <span className="rounded-[3px] border border-[#a371f733] bg-[#a371f70a] px-[10px] py-[4px] font-['Space_Mono'] text-[11px] font-bold text-[#a371f7]">
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

      {/* Rate Limit Section (only renders when data exists) */}
      {server.rateLimit && (
        <div className="flex flex-col gap-[6px]">
          <SectionHeader color="#e3b341">Rate Limit</SectionHeader>
          <div className="flex flex-col gap-[8px] rounded-[6px] border border-[#30363d] bg-[#161b22] px-[12px] py-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">
                {server.rateLimit.currentUsage ?? 0} / {server.rateLimit.maxPerMinute} req/min
              </span>
            </div>
            <div className="h-[4px] w-full overflow-hidden rounded-full bg-[#21262d]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((server.rateLimit.currentUsage ?? 0) / server.rateLimit.maxPerMinute) * 100)}%`,
                  backgroundColor:
                    (server.rateLimit.currentUsage ?? 0) / server.rateLimit.maxPerMinute > 0.9
                      ? '#f85149'
                      : (server.rateLimit.currentUsage ?? 0) / server.rateLimit.maxPerMinute > 0.7
                        ? '#e3b341'
                        : '#3fb950',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Authentication Section */}
      {hasAuth && (
        <div className="flex flex-col gap-[6px]">
          <SectionHeader color="#a371f7">Authentication</SectionHeader>

          <div className="flex flex-col gap-[8px] rounded-[6px] border border-[#30363d] bg-[#161b22] px-[12px] py-[10px]">
            {server.credentialFiles && server.credentialFiles.length > 0 && (
              <div className="flex items-center gap-[10px]">
                <span className="font-['Space_Mono'] text-[11px] text-[#8b949e]">Type</span>
                <span className="rounded-[3px] border border-[#a371f733] bg-[#a371f70a] px-[10px] py-[4px] font-['Space_Mono'] text-[11px] font-bold text-[#a371f7]">
                  Environment Variable
                </span>
              </div>
            )}
            {credentials.map((cred) => (
              <div key={cred.key} className="flex items-center gap-[10px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                <span className="font-['Space_Mono'] text-[12px] font-semibold text-[#cdd9e5]">
                  {cred.key}
                </span>
                <span className="font-['Space_Mono'] text-[12px] text-[#8b949e]">
                  {'•'.repeat(16)}
                </span>
              </div>
            ))}
          </div>

          <button className="flex items-center justify-center rounded-[6px] border border-[#a371f747] bg-[#a371f71a] px-[16px] py-[10px] font-['Space_Mono'] text-[11px] font-bold text-[#a371f7] transition-colors hover:bg-[#a371f733]">
            Update Credentials
          </button>
        </div>
      )}

      {/* Mode Section */}
      <div className="flex flex-col gap-[6px]">
        <SectionHeader>Mode</SectionHeader>
        <PillGroup
          options={MODE_OPTIONS}
          value={mcpModes[server.name] ?? server.mode ?? 'always'}
          onChange={(v) => setMcpMode(server.name, v)}
        />
      </div>

      {/* Scope Section */}
      <div className="flex flex-col gap-[6px]">
        <SectionHeader>Scope</SectionHeader>
        <PillGroup
          options={SCOPE_OPTIONS}
          value={mcpScopes[server.name] ?? 'global'}
          onChange={(v) => setMcpScope(server.name, v as 'global' | 'project')}
        />
        <span className="font-['Space_Mono'] text-[9px] text-[#8b949e]">
          MCP will only activate when working in this scope
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#21262d]" />

      {/* Tools Section */}
      <div className="flex flex-col gap-[16px]">
        <SectionHeader color="#cdd9e5">
          Available Tools ({toolCount})
        </SectionHeader>

        {toolSchemas.length > 0 ? (
          <>
            {/* Expanded tool card (first one or user-selected) */}
            {toolSchemas.map((tool) => {
              const isExpanded = expandedTool === tool.name;
              if (!isExpanded && expandedTool !== null) return null;
              if (!isExpanded && expandedTool === null && tool !== toolSchemas[0]) return null;

              const schema = tool.inputSchema as Record<string, unknown> | undefined;
              const properties = (schema?.properties || {}) as Record<string, { type?: string; description?: string }>;
              const required = (schema?.required || []) as string[];

              return (
                <div
                  key={tool.name}
                  className="rounded-[6px] border border-[#30363d] bg-[#161b22] overflow-hidden"
                >
                  {/* Tool header */}
                  <button
                    className="flex w-full items-center justify-between px-[12px] py-[8px] transition-colors hover:bg-[#1c2128]"
                    onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                  >
                    <div className="flex items-center gap-[8px]">
                      <Chevron expanded={true} />
                      <span className="font-['Space_Mono'] text-[11px] font-semibold text-[#cdd9e5]">
                        {tool.name}
                      </span>
                    </div>
                  </button>

                  {/* Tool body */}
                  <div className="flex flex-col gap-[6px] px-[12px] pb-[10px]">
                    {tool.description && (
                      <p className="font-['Space_Mono'] text-[9px] leading-[1.5] text-[#768390]">
                        {tool.description}
                      </p>
                    )}
                    {Object.keys(properties).length > 0 && (
                      <>
                        <span className="font-['Space_Mono'] text-[8px] font-bold uppercase tracking-[1px] text-[#4b535d]">
                          Parameters
                        </span>
                        {Object.entries(properties).map(([name, prop]) => (
                          <div key={name} className="flex items-center gap-[8px]">
                            <span className="font-['Space_Mono'] text-[10px] font-semibold text-[#cdd9e5]">
                              {name}
                            </span>
                            {prop.type && (
                              <span className="rounded-[2px] border border-[#30363d] bg-[#0d1117] px-[4px] py-[1px] font-['Space_Mono'] text-[8px] text-[#768390]">
                                {prop.type}
                              </span>
                            )}
                            {required.includes(name) && (
                              <span className="font-['Space_Mono'] text-[8px] text-[#f85149]">required</span>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Collapsed tool chips */}
            <div className="flex flex-wrap gap-[8px]">
              {toolSchemas.map((tool) => {
                const isShownExpanded =
                  expandedTool === tool.name ||
                  (expandedTool === null && tool === toolSchemas[0]);
                if (isShownExpanded) return null;

                return (
                  <button
                    key={tool.name}
                    className="rounded-[3px] border border-[#30363d] bg-[#161b22] px-[8px] py-[4px] font-['Space_Mono'] text-[9px] text-[#768390] transition-colors hover:border-[#a371f733] hover:text-[#cdd9e5]"
                    onClick={() => setExpandedTool(tool.name)}
                  >
                    {tool.name}
                  </button>
                );
              })}
            </div>
          </>
        ) : toolNames.length > 0 ? (
          <div className="flex flex-wrap gap-[8px]">
            {toolNames.map((name) => (
              <span
                key={name}
                className="rounded-[3px] border border-[#30363d] bg-[#161b22] px-[8px] py-[4px] font-['Space_Mono'] text-[9px] text-[#768390]"
              >
                {name}
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
