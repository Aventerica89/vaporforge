import { useMemo } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { deriveTier, TIER_CONFIG } from './types';
import { PluginComponentList } from './PluginComponentList';
import { PluginFilePreview } from './PluginFilePreview';
import type { Plugin, PluginItem } from '@/lib/types';

interface PluginDetailProps {
  plugin: Plugin;
}

/** Build a file tree from all plugin items */
function buildFileTree(plugin: Plugin): {
  root: Array<{ path: string; filename: string; isCustom: boolean }>;
  folders: Record<string, Array<{ path: string; filename: string; isCustom: boolean }>>;
} {
  const isCustom = deriveTier(plugin) === 'custom';
  const entries: Array<{ path: string; filename: string; isCustom: boolean }> = [];

  const sections: Array<{ key: string; items: PluginItem[] }> = [
    { key: 'agents', items: plugin.agents },
    { key: 'commands', items: plugin.commands },
    { key: 'rules', items: plugin.rules },
  ];

  for (const section of sections) {
    for (const item of section.items) {
      entries.push({
        path: `${section.key}/${item.filename}`,
        filename: item.filename,
        isCustom,
      });
    }
  }

  const root: typeof entries = [];
  const folders: Record<string, typeof entries> = {};

  for (const entry of entries) {
    const parts = entry.path.split('/');
    if (parts.length === 1) {
      root.push(entry);
    } else {
      const folder = parts[0];
      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(entry);
    }
  }

  return { root, folders };
}

function componentSummary(plugin: Plugin): string {
  const parts: string[] = [];
  if (plugin.agents.length) parts.push(`${plugin.agents.length} agent${plugin.agents.length === 1 ? '' : 's'}`);
  if (plugin.commands.length) parts.push(`${plugin.commands.length} command${plugin.commands.length === 1 ? '' : 's'}`);
  if (plugin.rules.length) parts.push(`${plugin.rules.length} rule${plugin.rules.length === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' \u00b7 ') : 'No components';
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
  } = useIntegrationsStore();

  const tier = deriveTier(plugin);
  const tierCfg = TIER_CONFIG[tier];
  const scope = pluginScopes[plugin.id] || 'global';
  const isCustom = tier === 'custom';
  const tree = useMemo(() => buildFileTree(plugin), [plugin]);
  const isRemoving = confirmRemove === plugin.id;

  const scopeText =
    scope === 'global'
      ? 'Active in all sessions and repositories. Changes apply everywhere.'
      : 'Active only in the selected repository. Overrides global settings for this project.';

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left column — info + components + file tree */}
      <div className="flex min-w-[280px] w-[42%] flex-col overflow-hidden border-r border-border">
        <div className="flex-1 overflow-y-auto p-5">
          {/* Header */}
          <div className="mb-3.5">
            <div className="mb-2.5 flex items-start gap-2">
              <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-foreground">
                {plugin.name}
              </span>
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {isCustom && (
                  <button
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] text-red-500 transition-all ${
                      isRemoving
                        ? 'border border-red-500 bg-red-500/15'
                        : 'border border-transparent hover:border-red-500 hover:bg-red-500/10'
                    }`}
                    onClick={() => {
                      if (isRemoving) {
                        removePlugin(plugin.id);
                      } else {
                        setConfirmRemove(plugin.id);
                      }
                    }}
                  >
                    {isRemoving ? 'confirm?' : 'remove'}
                  </button>
                )}
                <button
                  className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                    plugin.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
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

            {/* Scope pills */}
            <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] tracking-wide text-muted-foreground/60">
                SCOPE
              </span>
              {(['global', 'project'] as const).map((s) => (
                <button
                  key={s}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-all ${
                    scope === s
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setPluginScope(plugin.id, s)}
                >
                  {s === 'global' ? 'Global' : 'This Repo'}
                </button>
              ))}
            </div>
          </div>

          {/* Summary callout */}
          <div className="mb-3.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
            <div className="mb-1 text-[8px] font-bold uppercase tracking-widest text-amber-400">
              {componentSummary(plugin)}
            </div>
            {plugin.description && (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {plugin.description.split('.')[0]}
              </p>
            )}
          </div>

          {/* Meta */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {plugin.repoUrl ? (
              <a
                href={plugin.repoUrl.startsWith('http') ? plugin.repoUrl : `https://${plugin.repoUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary no-underline hover:underline"
              >
                {plugin.repoUrl.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="text-muted-foreground/40">local</span>
            )}
            <span
              className={`inline-block rounded-sm border px-1 py-px text-[8px] font-bold tracking-wide ${tierCfg.badgeClass}`}
            >
              {tier === 'official' ? 'Added by VaporForge' : tier === 'community' ? 'Community' : 'Added by You'}
            </span>
          </div>

          {plugin.description && (
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              {plugin.description}
            </p>
          )}

          {/* Scope callout */}
          <div className="mb-4 rounded-md border border-border/40 bg-card p-2.5">
            <div className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-primary">
              {scope.toUpperCase()}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {scopeText}
            </p>
          </div>

          <hr className="mb-3 border-border/40" />

          {/* Components */}
          <PluginComponentList plugin={plugin} />

          {/* File tree */}
          {(tree.root.length > 0 || Object.keys(tree.folders).length > 0) && (
            <details className="mt-5" open>
              <summary className="flex cursor-pointer select-none items-center justify-between border-t border-border/40 pb-2 pt-3">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Files
                </span>
                <span className="text-[9px] text-muted-foreground">&#9658;</span>
              </summary>

              {tree.root.map((file) => (
                <button
                  key={file.path}
                  className={`flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[10px] transition-all before:shrink-0 before:text-[9px] before:content-['[f]'] ${
                    selectedFile?.path === file.path && selectedFile?.pluginId === plugin.id
                      ? 'bg-card/80 text-primary before:text-muted-foreground/60'
                      : `text-muted-foreground hover:bg-card/80 hover:text-foreground ${
                          file.isCustom
                            ? 'before:text-amber-500 before:content-["[e]"]'
                            : 'before:text-muted-foreground/60'
                        }`
                  }`}
                  onClick={() => selectFile(plugin.id, file.path)}
                >
                  {file.filename}
                </button>
              ))}

              {Object.entries(tree.folders).map(([folder, files]) => (
                <details key={folder} open>
                  <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded-sm px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-card/80">
                    <span className="text-[9px]">&#9658;</span>
                    <span className="font-bold">{folder}/</span>
                  </summary>
                  <div className="pl-3.5">
                    {files.map((file) => (
                      <button
                        key={file.path}
                        className={`flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[10px] transition-all before:shrink-0 before:text-[9px] before:content-['[f]'] ${
                          selectedFile?.path === file.path && selectedFile?.pluginId === plugin.id
                            ? 'bg-card/80 text-primary before:text-muted-foreground/60'
                            : `text-muted-foreground hover:bg-card/80 hover:text-foreground ${
                                file.isCustom
                                  ? 'before:text-amber-500 before:content-["[e]"]'
                                  : 'before:text-muted-foreground/60'
                              }`
                        }`}
                        onClick={() => selectFile(plugin.id, file.path)}
                      >
                        {file.filename}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </details>
          )}
        </div>
      </div>

      {/* Right column — file preview */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <PluginFilePreview plugin={plugin} />
      </div>
    </div>
  );
}
