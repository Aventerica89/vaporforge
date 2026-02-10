import { create } from 'zustand';
import { pluginsApi } from '@/lib/api';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import type { Plugin } from '@/lib/types';

export type CardSize = 'compact' | 'normal' | 'large';
export type StatusTab = 'all' | 'installed';

interface MarketplaceState {
  isOpen: boolean;
  searchQuery: string;
  statusTab: StatusTab;
  cardSize: CardSize;
  selectedSource: 'all' | 'anthropic-official' | 'awesome-community';
  selectedCategories: string[];
  selectedTypes: string[];
  selectedCompatibility: 'all' | 'cloud-ready' | 'relay-required';
  installedRepoUrls: Set<string>;
  installing: Set<string>;

  openMarketplace: () => void;
  closeMarketplace: () => void;
  setSearchQuery: (query: string) => void;
  setStatusTab: (tab: StatusTab) => void;
  setCardSize: (size: CardSize) => void;
  setSelectedSource: (source: MarketplaceState['selectedSource']) => void;
  toggleCategory: (category: string) => void;
  toggleType: (type: string) => void;
  setSelectedCompatibility: (c: MarketplaceState['selectedCompatibility']) => void;
  clearFilters: () => void;
  installPlugin: (catalogPlugin: CatalogPlugin) => Promise<void>;
  uninstallPlugin: (repoUrl: string) => Promise<void>;
  syncInstalledPlugins: () => Promise<void>;
}

function extractRepoUrl(repositoryUrl: string): string {
  const match = repositoryUrl.match(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+)/
  );
  return match ? match[1] : repositoryUrl;
}

export const useMarketplace = create<MarketplaceState>((set, get) => ({
  isOpen: false,
  searchQuery: '',
  statusTab: 'all',
  cardSize: 'normal',
  selectedSource: 'all',
  selectedCategories: [],
  selectedTypes: [],
  selectedCompatibility: 'all',
  installedRepoUrls: new Set(),
  installing: new Set(),

  openMarketplace: () => {
    set({ isOpen: true });
    get().syncInstalledPlugins();
  },

  closeMarketplace: () => set({ isOpen: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setStatusTab: (tab) => set({ statusTab: tab }),

  setCardSize: (size) => set({ cardSize: size }),

  setSelectedSource: (source) => set({ selectedSource: source }),

  toggleCategory: (category) =>
    set((state) => {
      const cats = state.selectedCategories.includes(category)
        ? state.selectedCategories.filter((c) => c !== category)
        : [...state.selectedCategories, category];
      return { selectedCategories: cats };
    }),

  toggleType: (type) =>
    set((state) => {
      const types = state.selectedTypes.includes(type)
        ? state.selectedTypes.filter((t) => t !== type)
        : [...state.selectedTypes, type];
      return { selectedTypes: types };
    }),

  setSelectedCompatibility: (c) => set({ selectedCompatibility: c }),

  clearFilters: () =>
    set({
      searchQuery: '',
      selectedSource: 'all',
      selectedCategories: [],
      selectedTypes: [],
      selectedCompatibility: 'all',
    }),

  installPlugin: async (catalogPlugin) => {
    const repoUrl = extractRepoUrl(catalogPlugin.repository_url);
    set((state) => ({
      installing: new Set([...state.installing, catalogPlugin.id]),
    }));

    try {
      const result = await pluginsApi.discover(repoUrl);
      if (result.success && result.data) {
        const plugin: Omit<Plugin, 'id' | 'addedAt' | 'updatedAt'> = {
          name: result.data.name || catalogPlugin.name,
          description: result.data.description || catalogPlugin.description || undefined,
          repoUrl,
          scope: 'git',
          enabled: true,
          builtIn: false,
          agents: result.data.agents || [],
          commands: result.data.commands || [],
          rules: result.data.rules || [],
          mcpServers: result.data.mcpServers || [],
        };
        await pluginsApi.add(plugin);
        set((state) => ({
          installedRepoUrls: new Set([...state.installedRepoUrls, repoUrl]),
        }));
      }
    } catch {
      // Install failed — spinner will stop, user can retry
    } finally {
      set((state) => {
        const next = new Set(state.installing);
        next.delete(catalogPlugin.id);
        return { installing: next };
      });
    }
  },

  uninstallPlugin: async (repoUrl) => {
    try {
      const result = await pluginsApi.list();
      if (result.success && result.data) {
        const match = result.data.find((p) => p.repoUrl === repoUrl);
        if (match) {
          await pluginsApi.remove(match.id);
          set((state) => {
            const next = new Set(state.installedRepoUrls);
            next.delete(repoUrl);
            return { installedRepoUrls: next };
          });
        }
      }
    } catch {
      // Uninstall failed
    }
  },

  syncInstalledPlugins: async () => {
    try {
      const result = await pluginsApi.list();
      if (result.success && result.data) {
        const urls = new Set(
          result.data
            .filter((p): p is Plugin & { repoUrl: string } => !!p.repoUrl)
            .map((p) => p.repoUrl)
        );
        set({ installedRepoUrls: urls });
      }
    } catch {
      // Sync failed
    }
  },
}));
