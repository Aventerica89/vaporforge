import { Loader2, Star } from 'lucide-react';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';

interface MarketplaceCardProps {
  plugin: CatalogPlugin;
  size: 'compact' | 'normal' | 'large';
  isInstalled: boolean;
  isFavorite: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleFavorite: () => void;
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  'anthropic-official': {
    label: 'Official',
    className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  },
  'awesome-community': {
    label: 'Community',
    className: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  },
  custom: {
    label: 'Custom',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
};

const TYPE_COLORS: Record<string, string> = {
  agent: 'text-violet-400',
  skill: 'text-cyan-400',
  command: 'text-blue-400',
  rule: 'text-amber-400',
};

export function MarketplaceCard({
  plugin,
  size,
  isInstalled,
  isFavorite,
  isInstalling,
  onInstall,
  onUninstall,
  onToggleFavorite,
}: MarketplaceCardProps) {
  const isCompact = size === 'compact';
  const isLarge = size === 'large';
  const source = SOURCE_BADGE[plugin.source_id]
    || (plugin.source_id.startsWith('custom:') ? SOURCE_BADGE.custom : undefined);

  // iOS-friendly: Larger padding on mobile for better touch targets
  const padding = isCompact ? 'p-4 sm:p-3 gap-3 sm:gap-2' : isLarge ? 'p-5 gap-4' : 'p-5 sm:p-4 gap-4 sm:gap-3';

  return (
    <div
      className={`group relative flex flex-col rounded-lg border border-white/[0.06] bg-[hsl(215,22%,11%)] transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_20px_-4px_hsl(185,95%,55%,0.15)] ${padding}`}
    >
      {/* Source Badge + Status Dot + Favorite + Install/Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isInstalled && (
            <span
              className="w-2 h-2 rounded-full shrink-0 bg-cyan-400 shadow-[0_0_6px_hsl(185,95%,55%,0.6)]"
              title="Installed"
            />
          )}
          {source && (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${source.className}`}
            >
              {source.label}
            </span>
          )}
          {/* Favorite star */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`transition-colors ${
              isFavorite
                ? 'text-yellow-400 hover:text-yellow-500'
                : 'text-muted-foreground/30 hover:text-yellow-400'
            }`}
            style={{ minHeight: '44px', minWidth: '44px' }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Install / Toggle Control */}
        <div onClick={(e) => e.stopPropagation()}>
          {isInstalling ? (
            <span className="flex items-center justify-center text-xs text-muted-foreground" style={{ minHeight: '44px', minWidth: '44px' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
            </span>
          ) : isInstalled ? (
            /* Touch-target wrapper (44px) keeps the visual toggle correctly sized */
            <button
              onClick={onUninstall}
              className="flex items-center justify-center"
              style={{ minHeight: '44px', minWidth: '44px' }}
              title="Uninstall"
              aria-label="Uninstall plugin"
            >
              <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-cyan-500 shadow-[0_0_8px_hsl(185,95%,55%,0.3)] transition-colors duration-200">
                <span className="pointer-events-none inline-block h-4 w-4 translate-x-4 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform duration-200" />
              </span>
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="flex items-center justify-center text-xs font-semibold px-3 py-1 rounded transition-all duration-200 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_12px_-2px_hsl(185,95%,55%,0.3)] border border-cyan-500/20 hover:border-cyan-500/40"
              style={{ minHeight: '44px' }}
              aria-label="Install plugin"
            >
              Install
            </button>
          )}
        </div>
      </div>

      {/* Plugin Name */}
      <div className="flex-1">
        <h3
          className={`font-semibold text-[hsl(180,5%,95%)] group-hover:text-cyan-400 transition-colors duration-200 ${
            isCompact ? 'text-base sm:text-sm line-clamp-2' : isLarge ? 'text-lg' : 'text-lg sm:text-base'
          }`}
        >
          {plugin.name}
        </h3>

        {/* Description */}
        {!isCompact && plugin.description && (
          <p
            className={`text-[hsl(180,5%,55%)] mt-1.5 leading-relaxed ${
              isLarge ? 'text-sm line-clamp-3' : 'text-sm sm:text-xs line-clamp-2'
            }`}
          >
            {plugin.description}
          </p>
        )}
      </div>

      {/* Component Counts */}
      <div className={`flex gap-3 ${isCompact ? 'text-sm sm:text-xs flex-wrap' : 'text-base sm:text-sm'}`}>
        {plugin.agent_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.agent}>{plugin.agent_count}</span>
            <span className="text-[hsl(180,5%,50%)]">
              agent{plugin.agent_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.skill_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.skill}>{plugin.skill_count}</span>
            <span className="text-[hsl(180,5%,50%)]">
              skill{plugin.skill_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.command_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.command}>{plugin.command_count}</span>
            <span className="text-[hsl(180,5%,50%)]">
              command{plugin.command_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.rule_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.rule}>{plugin.rule_count}</span>
            <span className="text-[hsl(180,5%,50%)]">
              rule{plugin.rule_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Categories */}
      {!isCompact && plugin.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {plugin.categories.slice(0, isLarge ? 5 : 3).map((cat) => (
            <span
              key={cat}
              className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-[hsl(180,5%,55%)] border border-white/[0.04]"
            >
              {cat}
            </span>
          ))}
          {plugin.categories.length > (isLarge ? 5 : 3) && (
            <span className="text-[10px] text-[hsl(180,5%,45%)]">
              +{plugin.categories.length - (isLarge ? 5 : 3)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
