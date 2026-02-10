import { Puzzle } from 'lucide-react';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import type { CardSize } from '@/hooks/useMarketplace';
import { MarketplaceCard } from './MarketplaceCard';

interface MarketplaceGridProps {
  plugins: CatalogPlugin[];
  installedRepoUrls: Set<string>;
  installing: Set<string>;
  cardSize: CardSize;
  onInstall: (plugin: CatalogPlugin) => void;
  onUninstall: (repoUrl: string) => void;
}

const GRID_CLASSES: Record<CardSize, string> = {
  compact: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  normal: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  large: 'grid-cols-1 md:grid-cols-2',
};

function extractRepoUrl(repositoryUrl: string): string {
  const match = repositoryUrl.match(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+)/
  );
  return match ? match[1] : repositoryUrl;
}

export function MarketplaceGrid({
  plugins,
  installedRepoUrls,
  installing,
  cardSize,
  onInstall,
  onUninstall,
}: MarketplaceGridProps) {
  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Puzzle className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">
          No plugins match your filters
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Try adjusting your search or clearing filters
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${GRID_CLASSES[cardSize]}`}>
      {plugins.map((plugin) => {
        const repoUrl = extractRepoUrl(plugin.repository_url);
        return (
          <MarketplaceCard
            key={plugin.id}
            plugin={plugin}
            size={cardSize}
            isInstalled={installedRepoUrls.has(repoUrl)}
            isInstalling={installing.has(plugin.id)}
            onInstall={() => onInstall(plugin)}
            onUninstall={() => onUninstall(repoUrl)}
          />
        );
      })}
    </div>
  );
}
