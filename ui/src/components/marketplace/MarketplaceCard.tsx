import { Loader2 } from 'lucide-react';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';

interface MarketplaceCardProps {
  plugin: CatalogPlugin;
  size: 'compact' | 'normal' | 'large';
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  'anthropic-official': {
    label: 'Official',
    className: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  'awesome-community': {
    label: 'Community',
    className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  },
};

const TYPE_COLORS: Record<string, string> = {
  agent: 'text-purple-400',
  skill: 'text-green-400',
  command: 'text-blue-400',
  rule: 'text-orange-400',
};

export function MarketplaceCard({
  plugin,
  size,
  isInstalled,
  isInstalling,
  onInstall,
  onUninstall,
}: MarketplaceCardProps) {
  const isCompact = size === 'compact';
  const isLarge = size === 'large';
  const source = SOURCE_BADGE[plugin.source_id];

  const padding = isCompact ? 'p-4 sm:p-3 gap-3 sm:gap-2' : isLarge ? 'p-5 gap-4' : 'p-4 gap-3';

  return (
    <div
      className={`group relative flex flex-col bg-card border border-border rounded-lg hover:border-violet-500/30 transition-all duration-200 ${padding}`}
    >
      {/* Source Badge + Status Dot + Install/Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isInstalled && (
            <span
              className="w-2 h-2 rounded-full shrink-0 bg-green-400"
              title="Installed"
            />
          )}
          {source && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded border ${source.className}`}
            >
              {source.label}
            </span>
          )}
        </div>

        {/* Install / Toggle Control */}
        <div onClick={(e) => e.stopPropagation()}>
          {isInstalling ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          ) : isInstalled ? (
            <button
              onClick={onUninstall}
              className={`relative inline-flex h-6 w-11 sm:h-5 sm:w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 bg-violet-500`}
              style={{ minHeight: '44px', minWidth: '44px' }}
              title="Uninstall"
              aria-label="Uninstall plugin"
            >
              <span className="pointer-events-none inline-block h-5 w-5 sm:h-4 sm:w-4 rounded-full bg-white shadow-sm transition-transform duration-200 translate-x-5 sm:translate-x-4" />
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="text-xs font-medium px-4 py-2 sm:px-2.5 sm:py-1 rounded transition-colors bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20"
              style={{ minHeight: '44px' }}
            >
              Install
            </button>
          )}
        </div>
      </div>

      {/* Plugin Name */}
      <div className="flex-1">
        <h3
          className={`font-semibold group-hover:text-violet-400 transition-colors ${
            isCompact ? 'text-base sm:text-sm line-clamp-2' : isLarge ? 'text-lg' : 'text-base'
          }`}
        >
          {plugin.name}
        </h3>

        {/* Description */}
        {!isCompact && plugin.description && (
          <p
            className={`text-muted-foreground mt-1 ${
              isLarge ? 'text-sm line-clamp-3' : 'text-sm sm:text-xs line-clamp-2'
            }`}
          >
            {plugin.description}
          </p>
        )}
      </div>

      {/* Component Counts (text-based) */}
      <div className={`flex gap-3 ${isCompact ? 'text-xs flex-wrap' : 'text-sm'}`}>
        {plugin.agent_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.agent}>{plugin.agent_count}</span>
            <span className="text-muted-foreground">
              agent{plugin.agent_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.skill_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.skill}>{plugin.skill_count}</span>
            <span className="text-muted-foreground">
              skill{plugin.skill_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.command_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.command}>{plugin.command_count}</span>
            <span className="text-muted-foreground">
              command{plugin.command_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {plugin.rule_count > 0 && (
          <div className="flex items-center gap-1">
            <span className={TYPE_COLORS.rule}>{plugin.rule_count}</span>
            <span className="text-muted-foreground">
              rule{plugin.rule_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Categories */}
      {!isCompact && plugin.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {plugin.categories.slice(0, isLarge ? 5 : 3).map((cat) => (
            <span
              key={cat}
              className="text-xs px-2 py-0.5 rounded bg-foreground/5 text-muted-foreground"
            >
              {cat}
            </span>
          ))}
          {plugin.categories.length > (isLarge ? 5 : 3) && (
            <span className="text-xs text-muted-foreground">
              +{plugin.categories.length - (isLarge ? 5 : 3)}
            </span>
          )}
        </div>
      )}

      {/* Hover ring indicator */}
      <div className="absolute inset-0 rounded-lg pointer-events-none ring-2 ring-violet-500/0 group-hover:ring-violet-500/10 transition-all duration-200" />
    </div>
  );
}
