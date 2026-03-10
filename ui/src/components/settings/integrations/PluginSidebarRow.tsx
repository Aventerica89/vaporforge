import type { Plugin } from '@/lib/types';
import type { PluginTier } from './types';

/** A "package" is a group of plugins from the same source */
export interface PluginPackage {
  key: string;
  name: string;
  tier: PluginTier;
  plugins: Plugin[];
}

interface PluginSidebarRowProps {
  pkg: PluginPackage;
  isActive: boolean;
  onSelect: () => void;
  onToggleAll: () => void;
}

const TIER_BADGE: Record<PluginTier, { label: string; cls: string }> = {
  official: { label: 'included', cls: 'border-[#00e5ff47] bg-[#00e5ff1a] text-[#00e5ff]' },
  community: { label: 'community', cls: 'border-[#a371f747] bg-[#a371f71a] text-[#a371f7]' },
  custom: { label: 'custom', cls: 'border-[#f8514947] bg-[#f851491a] text-[#f85149]' },
};

function countComponents(plugins: Plugin[]): { total: number; active: number } {
  let total = 0;
  let active = 0;
  for (const p of plugins) {
    const items = [...p.agents, ...p.commands, ...p.rules];
    total += items.length;
    active += items.filter((i) => i.enabled).length;
  }
  return { total, active };
}

export function PluginSidebarRow({
  pkg,
  isActive,
  onSelect,
  onToggleAll,
}: PluginSidebarRowProps) {
  const badge = TIER_BADGE[pkg.tier];
  const { total, active } = countComponents(pkg.plugins);
  const allEnabled = pkg.plugins.every((p) => p.enabled);

  // Build meta line: "N plugins · M active"
  const pluginCount = pkg.plugins.length;
  const meta =
    total > 0
      ? `${pluginCount} plugin${pluginCount === 1 ? '' : 's'} \u00b7 ${active} active`
      : 'No components';

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
          <span
            className={`truncate font-['Space_Mono'] text-[11px] text-[#cdd9e5] ${
              isActive ? 'font-bold' : 'font-normal'
            }`}
          >
            {pkg.name}
          </span>
          <span
            className={`shrink-0 rounded-[3px] border px-1.5 py-px font-['Space_Mono'] text-[8px] font-bold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="mt-0.5 font-['Space_Mono'] text-[9px] text-[#768390]">
          {meta}
        </div>
      </div>

      <button
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          allEnabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleAll();
        }}
      >
        <span
          className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
            allEnabled ? 'left-[15px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}
