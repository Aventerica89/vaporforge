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
  isExpanded: boolean;
  selectedPluginId: string | null;
  onSelect: () => void;
  onToggleExpand: () => void;
  onToggleAll: () => void;
  onSelectPlugin: (id: string) => void;
  onTogglePlugin: (id: string) => void;
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

function pluginMeta(p: Plugin): string {
  const parts: string[] = [];
  if (p.agents.length) parts.push(`${p.agents.length} agent${p.agents.length > 1 ? 's' : ''}`);
  if (p.commands.length) parts.push(`${p.commands.length} cmd${p.commands.length > 1 ? 's' : ''}`);
  if (p.rules.length) parts.push(`${p.rules.length} rule${p.rules.length > 1 ? 's' : ''}`);
  return parts.join(' \u00b7 ') || 'No components';
}

/** Chevron icon — points right (collapsed) or down (expanded) */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={expanded ? '#768390' : '#4b535d'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Toggle switch (matches VF Toggle/On and Toggle/Off from design) */
function Toggle({ enabled, onClick }: { enabled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
      }`}
      onClick={onClick}
    >
      <span
        className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
          enabled ? 'left-[15px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

export function PluginSidebarRow({
  pkg,
  isActive,
  isExpanded,
  selectedPluginId,
  onSelect,
  onToggleExpand,
  onToggleAll,
  onSelectPlugin,
  onTogglePlugin,
}: PluginSidebarRowProps) {
  const badge = TIER_BADGE[pkg.tier];
  const { total, active } = countComponents(pkg.plugins);
  const allEnabled = pkg.plugins.every((p) => p.enabled);
  const expandable = pkg.plugins.length > 1;

  const pluginCount = pkg.plugins.length;
  const meta =
    total > 0
      ? `${pluginCount} plugin${pluginCount === 1 ? '' : 's'} \u00b7 ${active} active`
      : 'No components';

  const handleRowClick = () => {
    if (expandable) {
      onToggleExpand();
      if (!isExpanded) onSelect();
    } else {
      onSelect();
    }
  };

  return (
    <>
      {/* Source row */}
      <div
        className={`group relative flex h-[52px] cursor-pointer items-center justify-between transition-colors ${
          isActive
            ? 'bg-[#1c2128] py-[6px] px-[14px]'
            : 'py-[6px] pr-[14px] pl-[14px] hover:bg-[#1c2128]/50'
        }`}
        onClick={handleRowClick}
      >
        {isActive && (
          <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#00e5ff]" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {expandable && <Chevron expanded={isExpanded} />}
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
          <div className={`mt-0.5 font-['Space_Mono'] text-[9px] text-[#768390] ${expandable ? 'pl-5' : ''}`}>
            {meta}
          </div>
        </div>

        <Toggle
          enabled={allEnabled}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll();
          }}
        />
      </div>

      {/* Expanded plugin sub-rows */}
      {isExpanded &&
        pkg.plugins.map((plugin) => {
          const isSelected = plugin.id === selectedPluginId;
          return (
            <div
              key={plugin.id}
              className={`relative flex h-[40px] cursor-pointer items-center justify-between pr-[14px] pl-[36px] transition-colors ${
                isSelected
                  ? 'bg-[#1c2128]'
                  : 'hover:bg-[#1c2128]/50'
              }`}
              onClick={() => onSelectPlugin(plugin.id)}
            >
              {isSelected && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#00e5ff]" />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate font-['Space_Mono'] text-[10px] ${
                    isSelected ? 'font-bold text-[#cdd9e5]' : 'font-normal text-[#adbac7]'
                  }`}
                >
                  {plugin.name}
                </div>
                <div className="mt-px font-['Space_Mono'] text-[8px] text-[#768390]">
                  {pluginMeta(plugin)}
                </div>
              </div>
              <Toggle
                enabled={plugin.enabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlugin(plugin.id);
                }}
              />
            </div>
          );
        })}
    </>
  );
}
