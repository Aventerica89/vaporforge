import { useEffect } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { deriveTier } from './types';
import { PluginComponentList } from './PluginComponentList';
import { PluginFilePreview } from './PluginFilePreview';
import type { Plugin } from '@/lib/types';

interface PluginDetailProps {
  plugin: Plugin;
}

function componentSummary(plugin: Plugin): string {
  const parts: string[] = [];
  if (plugin.agents.length) parts.push(`${plugin.agents.length} SKILL${plugin.agents.length === 1 ? '' : 'S'}`);
  if (plugin.commands.length) parts.push(`${plugin.commands.length} COMMAND${plugin.commands.length === 1 ? '' : 'S'}`);
  if (plugin.rules.length) parts.push(`${plugin.rules.length} RULE${plugin.rules.length === 1 ? '' : 'S'}`);
  return parts.length > 0 ? parts.join('  \u00b7  ') : 'No components';
}

export function PluginDetail({ plugin }: PluginDetailProps) {
  const {
    togglePlugin,
    pluginScopes,
    setPluginScope,
    confirmRemove,
    setConfirmRemove,
    removePlugin,
    selectedFile,
    selectFile,
    mcpStatuses,
    selectMcp,
  } = useIntegrationsStore();

  const tier = deriveTier(plugin);
  const scope = pluginScopes[plugin.id] || 'global';
  const isRemoving = confirmRemove === plugin.id;

  // Auto-select the first file when the plugin changes
  useEffect(() => {
    const alreadySelected =
      selectedFile?.pluginId === plugin.id && selectedFile?.path;
    if (alreadySelected) return;

    const sections = [
      { key: 'agents', items: plugin.agents },
      { key: 'commands', items: plugin.commands },
      { key: 'rules', items: plugin.rules },
    ];
    for (const section of sections) {
      if (section.items.length > 0) {
        selectFile(plugin.id, `${section.key}/${section.items[0].filename}`);
        return;
      }
    }
  }, [plugin.id]);

  const tierLabel = tier === 'official' ? 'included' : tier === 'community' ? 'community' : 'custom';
  const tierBadgeClass = tier === 'official'
    ? 'border-[#00e5ff47] bg-[#00e5ff1a] text-[#00e5ff]'
    : tier === 'community'
      ? 'border-[#a371f747] bg-[#a371f71a] text-[#a371f7]'
      : 'border-[#f8514947] bg-[#f851491a] text-[#f85149]';

  const scopeText =
    scope === 'global'
      ? 'Active in all sessions and repositories. Changes apply everywhere.'
      : 'Plugin will only activate when working in this repo';

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left column — info + components */}
      <div className="flex min-w-[280px] w-[42%] flex-col min-h-0 overflow-hidden border-r border-[#30363d]">
        <div className="flex h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[40px] py-[32px]">
          {/* Detail Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-['Space_Mono'] text-[18px] font-semibold text-white">
                {plugin.name}
              </span>
              <span className={`rounded-[3px] border px-[5px] py-[1px] font-['Space_Mono'] text-[8px] font-bold tracking-[0.8px] ${tierBadgeClass}`}>
                {tierLabel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!plugin.builtIn && (
                <button
                  className={`rounded px-[7px] py-[2px] font-['Space_Mono'] text-xs font-medium transition-all ${
                    isRemoving
                      ? 'border border-[#f8514959] bg-[#f851491a] text-[#f85149]'
                      : 'border border-[#f8514959] bg-[#f851491a] text-[#f85149] hover:bg-[#f8514933]'
                  }`}
                  onClick={() => {
                    if (isRemoving) {
                      removePlugin(plugin.id);
                    } else {
                      setConfirmRemove(plugin.id);
                    }
                  }}
                >
                  {isRemoving ? 'Confirm?' : 'Remove'}
                </button>
              )}
              <button
                className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                  plugin.enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
                }`}
                onClick={() => togglePlugin(plugin.id)}
              >
                <span
                  className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
                    plugin.enabled ? 'left-[15px]' : 'left-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Scope Section */}
          <div>
            <div className="mb-1.5 font-['Space_Mono'] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#8b949e]">
              Scope
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {(['global', 'project'] as const).map((s) => (
                <button
                  key={s}
                  className={`rounded-full border px-3 py-1 font-['Space_Mono'] text-[10px] transition-all ${
                    scope === s
                      ? 'border-[#00e5ff47] bg-[#00e5ff1a] text-[#00e5ff]'
                      : 'border-[#30363d] text-[#768390] hover:text-foreground'
                  }`}
                  onClick={() => setPluginScope(plugin.id, s)}
                >
                  {s === 'global' ? 'Global' : 'This Repo'}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Callout */}
          <div className="rounded-[6px] border border-[#f8514947] bg-[#f851491a] px-[12px] py-[10px]">
            <div className="mb-[2px] font-['Space_Mono'] text-[8px] font-bold uppercase tracking-[1px] text-[#f85149]">
              AI Summary
            </div>
            <div className="mb-1 font-['Space_Mono'] text-[11px] leading-[1.6] text-[#768390]">
              {componentSummary(plugin)}
            </div>
            {plugin.description && (
              <p className="font-['Space_Mono'] text-[11px] leading-[1.6] text-[#768390]">
                {plugin.description.split('.')[0]}.
              </p>
            )}
          </div>

          {/* Full description */}
          {plugin.description && (
            <p className="font-['Space_Mono'] text-[13px] leading-[1.6] text-[#8b949e]">
              {plugin.description}
            </p>
          )}

          {/* Meta Row */}
          <div className="flex flex-wrap items-center gap-2">
            {plugin.repoUrl && (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#768390" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
                <a
                  href={plugin.repoUrl.startsWith('http') ? plugin.repoUrl : `https://${plugin.repoUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-['Space_Mono'] text-[10px] text-[#00e5ff] no-underline hover:underline"
                >
                  {plugin.repoUrl.replace(/^https?:\/\//, '')}
                </a>
              </>
            )}
            <span className={`rounded-[3px] border px-2 py-[2px] font-['Space_Mono'] text-[8px] font-bold tracking-[0.4px] ${tierBadgeClass}`}>
              {tier === 'official' ? 'Added by VaporForge' : tier === 'community' ? 'Community' : 'Added by You'}
            </span>
          </div>

          {/* Scope Callout */}
          <div className="rounded-[6px] border border-[#00e5ff33] bg-[#00e5ff0a] px-[14px] py-[10px]">
            <div className="mb-1 font-['Space_Mono'] text-[9px] font-bold uppercase tracking-[1.2px] text-[#00e5ff]">
              {scope.toUpperCase()}
            </div>
            <p className="font-['Space_Mono'] text-[10px] leading-[1.5] text-[#768390]">
              {scopeText}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#21262d]" />

          {/* Components */}
          <PluginComponentList plugin={plugin} />

          {/* Required Integrations (MCP dependencies) */}
          {plugin.mcpServers.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 font-['Space_Mono'] text-[10px] font-bold uppercase tracking-widest text-[#8b949e]/60">
                Required Integrations
              </div>
              <div className="space-y-1.5">
                {plugin.mcpServers.map((mcp) => {
                  const mcpStatus = mcpStatuses[mcp.name];
                  const isConnected = mcpStatus === 'connected';

                  return (
                    <button
                      key={mcp.name}
                      className="flex w-full items-center gap-2 rounded-md border border-[#30363d] bg-[#1c2128] px-2.5 py-1.5 text-left transition-colors hover:bg-[#1c2128]/80"
                      onClick={() => selectMcp(mcp.name)}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        isConnected
                          ? 'bg-[#3fb950] shadow-[0_0_4px_#3fb950]'
                          : 'bg-[#768390]'
                      }`} />
                      <span className="flex-1 font-['Space_Mono'] text-[10px] text-[#cdd9e5]">
                        {mcp.name}
                      </span>
                      {isConnected ? (
                        <span className="font-['Space_Mono'] text-[9px] text-[#3fb950]">connected</span>
                      ) : (
                        <span className="font-['Space_Mono'] text-[9px] text-[#768390]">
                          Configure &rarr;
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right column — file preview */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[#0d1117]">
        <PluginFilePreview plugin={plugin} />
      </div>
    </div>
  );
}
