import { Puzzle } from 'lucide-react';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import type { CardSize } from '@/hooks/useMarketplace';
import { MarketplaceCard } from './MarketplaceCard';

interface MarketplaceGridProps {
  plugins: CatalogPlugin[];
  installedRepoUrls: Set<string>;
  favoriteRepoUrls: Set<string>;
  installing: Set<string>;
  cardSize: CardSize;
  onInstall: (plugin: CatalogPlugin) => void;
  onUninstall: (repoUrl: string) => void;
  onToggleFavorite: (repoUrl: string) => void;
}

const GRID_CLASSES: Record<CardSize, string> = {
  compact: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  normal: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  large: 'grid-cols-1 md:grid-cols-2',
};

export function MarketplaceGrid({
  plugins,
  installedRepoUrls,
  favoriteRepoUrls,
  installing,
  cardSize,
  onInstall,
  onUninstall,
  onToggleFavorite,
}: MarketplaceGridProps) {
  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Puzzle className="mb-3 h-10 w-10 text-[hsl(180,5%,25%)]" />
        <p className="text-sm font-medium text-[hsl(180,5%,55%)]">
          No plugins match your filters
        </p>
        <p className="mt-1 text-xs text-[hsl(180,5%,35%)]">
          Try adjusting your search or clearing filters
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${GRID_CLASSES[cardSize]}`}>
      {plugins.map((plugin) => (
        <MarketplaceCard
          key={plugin.id}
          plugin={plugin}
          size={cardSize}
          isInstalled={installedRepoUrls.has(plugin.repository_url)}
          isFavorite={favoriteRepoUrls.has(plugin.repository_url)}
          isInstalling={installing.has(plugin.id)}
          onInstall={() => onInstall(plugin)}
          onUninstall={() => onUninstall(plugin.repository_url)}
          onToggleFavorite={() => onToggleFavorite(plugin.repository_url)}
        />
      ))}
    </div>
  );
}
