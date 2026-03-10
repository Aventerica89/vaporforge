import type { Plugin } from '@/lib/types';
import { deriveTier } from './types';

interface PluginSidebarRowProps {
  plugin: Plugin;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

export function PluginSidebarRow({
  plugin,
  isActive,
  onSelect,
  onToggle,
}: PluginSidebarRowProps) {
  const tier = deriveTier(plugin);

  const tierLabel = tier === 'official' ? 'included' : tier === 'community' ? 'community' : 'custom';
  const tierBadgeClass = tier === 'official'
    ? 'border-[#00e5ff47] bg-[#00e5ff1a] text-[#00e5ff]'
    : tier === 'community'
      ? 'border-[#a371f747] bg-[#a371f71a] text-[#a371f7]'
      : 'border-[#f8514947] bg-[#f851491a] text-[#f85149]';

  const parts: string[] = [];
  if (plugin.agents.length) parts.push(`${plugin.agents.length} agent${plugin.agents.length === 1 ? '' : 's'}`);
  if (plugin.commands.length) parts.push(`${plugin.commands.length} cmd${plugin.commands.length === 1 ? '' : 's'}`);
  if (plugin.rules.length) parts.push(`${plugin.rules.length} rule${plugin.rules.length === 1 ? '' : 's'}`);
  const enabledCount = [...plugin.agents, ...plugin.commands, ...plugin.rules].filter((i) => i.enabled).length;
  const totalCount = plugin.agents.length + plugin.commands.length + plugin.rules.length;

  return (
    <div
      className={`group relative flex h-[52px] cursor-pointer items-center justify-between transition-colors ${
        isActive
          ? 'bg-[#1c2128] py-[6px] px-[14px]'
          : 'py-[6px] pr-[14px] pl-[22px] hover:bg-[#1c2128]/50'
      }`}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#00e5ff]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-['Space_Mono'] text-[11px] text-[#cdd9e5] ${isActive ? 'font-bold' : 'font-normal'}`}>
            {plugin.name}
          </span>
          <span className={`shrink-0 rounded-[3px] border px-1.5 py-px font-['Space_Mono'] text-[8px] font-bold ${tierBadgeClass}`}>
            {tierLabel}
          </span>
        </div>
        <div className="mt-0.5 font-['Space_Mono'] text-[9px] text-[#768390]">
          {totalCount > 0
            ? `${totalCount} plugin${totalCount === 1 ? '' : 's'} \u00b7 ${enabledCount} active`
            : parts.join(' \u00b7 ') || 'No components'}
        </div>
      </div>

      <button
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          plugin.enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
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
