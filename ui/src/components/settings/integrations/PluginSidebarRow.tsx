import type { Plugin } from '@/lib/types';
import { deriveTier, TIER_CONFIG } from './types';

interface PluginSidebarRowProps {
  plugin: Plugin;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
  scopeIndicator?: boolean;
}

export function PluginSidebarRow({
  plugin,
  isActive,
  onSelect,
  onToggle,
  scopeIndicator,
}: PluginSidebarRowProps) {
  const tier = deriveTier(plugin);
  const tierCfg = TIER_CONFIG[tier];

  const agentCount = plugin.agents.length;
  const cmdCount = plugin.commands.length;
  const ruleCount = plugin.rules.length;
  const parts: string[] = [];
  if (agentCount) parts.push(`${agentCount} agent${agentCount === 1 ? '' : 's'}`);
  if (cmdCount) parts.push(`${cmdCount} cmd${cmdCount === 1 ? '' : 's'}`);
  if (ruleCount) parts.push(`${ruleCount} rule${ruleCount === 1 ? '' : 's'}`);

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 px-3.5 py-1.5 pl-5 transition-colors ${
        isActive
          ? 'bg-card/80'
          : 'hover:bg-card/40'
      }`}
      style={{ minHeight: 38 }}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
      )}

      <span className="w-6 shrink-0 text-center font-mono text-[11px] font-bold text-muted-foreground">
        {plugin.name.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs leading-snug ${
            plugin.enabled ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {plugin.name}
        </span>
        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span
            className={`inline-block rounded-sm border px-1 py-px text-[8px] font-bold tracking-wide ${tierCfg.badgeClass}`}
          >
            {tier}
          </span>
          {parts.length > 0 && <span>{parts.join(' \u00b7 ')}</span>}
        </div>
      </div>

      {scopeIndicator && (
        <span className="shrink-0 rounded-sm border border-primary/30 px-1 text-[8px] text-primary">
          ~
        </span>
      )}

      <button
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          plugin.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span
          className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
            plugin.enabled ? 'left-[15px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}
