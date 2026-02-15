import { create } from 'zustand';
import { pluginsApi, pluginSourcesApi } from '@/lib/api';
import type { PluginSource } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useDevChangelog } from '@/hooks/useDevChangelog';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import type { Plugin } from '@/lib/types';

const MAX_ITEMS_PER_CATEGORY = 10;

/**
 * Build rich fallback content when GitHub discovery returns empty.
 * Gives the SDK actionable context instead of a useless stub.
 */
function buildFallbackContent(
  componentName: string,
  pluginDescription: string,
  pluginName: string,
): string {
  return [
    `# /${componentName}`,
    '',
    `> From the **${pluginName}** plugin`,
    '',
    pluginDescription,
    '',
    '## Instructions',
    '',
    `You are running the "/${componentName}" command.`,
    `Use the description above to understand what this tool does,`,
    'then help the user accomplish their goal.',
    '',
    '- Read any files the user references for context',
    '- Generate complete, working output',
    '- Write files to the workspace when appropriate',
    '- Explain what you created and how to use it',
  ].join('\n');
}

/** Best-effort sync plugins into the active sandbox (non-blocking). */
function syncToActiveSession(): void {
  const session = useSandboxStore.getState().currentSession;
  if (session?.id) {
    pluginsApi.sync(session.id).catch(console.error);
  }
}

export type CardSize = 'compact' | 'normal' | 'large';
export type StatusTab = 'all' | 'installed' | 'favorites';

interface MarketplaceState {
  isOpen: boolean;
  searchQuery: string;
  statusTab: StatusTab;
  cardSize: CardSize;
  selectedSource: string;
  selectedCategories: string[];
  selectedTypes: string[];
  selectedCompatibility: 'all' | 'cloud-ready' | 'relay-required';
  installedRepoUrls: Set<string>;
  favoriteRepoUrls: Set<string>;
  installing: Set<string>;
  installError: string | null;

  // Discover from URL
  discoveredPlugin: Plugin | null;
  isDiscovering: boolean;
  discoverError: string | null;

  // Refresh installed
  isRefreshing: boolean;

  // Custom sources
  customSources: PluginSource[];
  customCatalog: CatalogPlugin[];
  isLoadingSources: boolean;
  sourcesRefreshedAt: string | null;

  openMarketplace: () => void;
  closeMarketplace: () => void;
  setSearchQuery: (query: string) => void;
  setStatusTab: (tab: StatusTab) => void;
  setCardSize: (size: CardSize) => void;
  setSelectedSource: (source: string) => void;
  toggleCategory: (category: string) => void;
  toggleType: (type: string) => void;
  setSelectedCompatibility: (c: MarketplaceState['selectedCompatibility']) => void;
  clearFilters: () => void;
  clearInstallError: () => void;
  installPlugin: (catalogPlugin: CatalogPlugin) => Promise<void>;
  uninstallPlugin: (repoUrl: string) => Promise<void>;
  syncInstalledPlugins: () => Promise<void>;
  toggleFavorite: (repoUrl: string) => void;
  discoverFromUrl: (url: string) => Promise<void>;
  clearDiscovered: () => void;
  installDiscovered: () => Promise<void>;
  refreshInstalled: () => Promise<{ refreshed: number }>;
  loadCustomSources: () => Promise<void>;
  addSource: (url: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  refreshSources: () => Promise<void>;
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
  favoriteRepoUrls: new Set(
    (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('vf-favorites') || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    })()
  ),
  installing: new Set(),
  installError: null,
  discoveredPlugin: null,
  isDiscovering: false,
  discoverError: null,
  isRefreshing: false,
  customSources: [],
  customCatalog: [],
  isLoadingSources: false,
  sourcesRefreshedAt: null,

  openMarketplace: () => {
    useDevChangelog.getState().closeChangelog();
    set({ isOpen: true });
    get().syncInstalledPlugins();
    get().loadCustomSources();
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

  clearInstallError: () => set({ installError: null }),

  installPlugin: async (catalogPlugin) => {
    // Store the full repository_url (including /tree/main/plugins/X subpath)
    // as the repoUrl. This ensures monorepo plugins each have a unique ID.
    const repoUrl = catalogPlugin.repository_url;
    set((state) => ({
      installing: new Set([...state.installing, catalogPlugin.id]),
      installError: null,
    }));

    try {
      // Discover from GitHub — pass full URL so subpath plugins are found
      const result = await pluginsApi.discover(repoUrl);

      // Build plugin from discovery results + catalog metadata as fallback
      const discovered = result.success && result.data ? result.data : null;
      const hasDiscoveredContent = discovered &&
        (discovered.agents.length > 0 ||
         discovered.commands.length > 0 ||
         discovered.rules.length > 0);

      // If discovery found nothing, create placeholder commands from catalog
      // components so the plugin isn't completely empty.
      // Include the plugin description + actionable instructions so the SDK
      // can actually do something useful (not just "Run the X command").
      let fallbackCommands: Array<{
        name: string; filename: string; content: string; enabled: boolean;
      }> = [];
      if (!hasDiscoveredContent && catalogPlugin.components.length > 0) {
        const pluginDesc = catalogPlugin.description || catalogPlugin.name;
        fallbackCommands = catalogPlugin.components
          .filter((comp) => comp.type === 'command' || comp.type === 'skill')
          .slice(0, MAX_ITEMS_PER_CATEGORY)
          .map((comp) => ({
            name: comp.name,
            filename: `${comp.slug}.md`,
            content: buildFallbackContent(comp.name, pluginDesc, catalogPlugin.name),
            enabled: true,
          }));
      }

      const plugin: Omit<Plugin, 'id' | 'addedAt' | 'updatedAt'> = {
        name: discovered?.name || catalogPlugin.name,
        description: (catalogPlugin.description || discovered?.description || '')
          .slice(0, 2000) || undefined,
        repoUrl,
        scope: 'git',
        enabled: true,
        builtIn: false,
        agents: discovered?.agents || [],
        commands: hasDiscoveredContent
          ? (discovered?.commands || [])
          : fallbackCommands,
        rules: discovered?.rules || [],
        mcpServers: discovered?.mcpServers || [],
      };

      await pluginsApi.add(plugin);
      set((state) => ({
        installedRepoUrls: new Set([...state.installedRepoUrls, repoUrl]),
      }));
      syncToActiveSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      set({ installError: `Failed to install ${catalogPlugin.name}: ${msg}` });
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
          syncToActiveSession();
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

  toggleFavorite: (repoUrl) => {
    set((state) => {
      const favorites = new Set(state.favoriteRepoUrls);
      if (favorites.has(repoUrl)) {
        favorites.delete(repoUrl);
      } else {
        favorites.add(repoUrl);
      }
      // Persist to localStorage
      localStorage.setItem('vf-favorites', JSON.stringify([...favorites]));
      return { favoriteRepoUrls: favorites };
    });
  },

  discoverFromUrl: async (url) => {
    set({ isDiscovering: true, discoverError: null, discoveredPlugin: null });
    try {
      const result = await pluginsApi.discover(url);
      if (result.success && result.data) {
        set({ discoveredPlugin: result.data, isDiscovering: false });
      } else {
        set({ discoverError: result.error || 'Discovery failed', isDiscovering: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Discovery failed';
      set({ discoverError: msg, isDiscovering: false });
    }
  },

  clearDiscovered: () => set({ discoveredPlugin: null, discoverError: null }),

  installDiscovered: async () => {
    const { discoveredPlugin } = get();
    if (!discoveredPlugin) return;

    const repoUrl = discoveredPlugin.repoUrl || '';
    set({ installError: null });

    try {
      await pluginsApi.add(discoveredPlugin);
      set((state) => ({
        installedRepoUrls: new Set([...state.installedRepoUrls, repoUrl]),
        discoveredPlugin: null,
        discoverError: null,
      }));
      syncToActiveSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      set({ installError: `Failed to install: ${msg}` });
    }
  },

  refreshInstalled: async () => {
    set({ isRefreshing: true });
    try {
      const result = await pluginsApi.refresh();
      if (result.success && result.data) {
        // Re-sync installed URLs after refresh
        await get().syncInstalledPlugins();
        syncToActiveSession();
        set({ isRefreshing: false });
        return { refreshed: result.data.refreshed };
      }
      set({ isRefreshing: false });
      return { refreshed: 0 };
    } catch {
      set({ isRefreshing: false });
      return { refreshed: 0 };
    }
  },

  loadCustomSources: async () => {
    try {
      const [sourcesRes, catalogRes] = await Promise.all([
        pluginSourcesApi.list(),
        pluginSourcesApi.catalog(),
      ]);

      if (sourcesRes.success && sourcesRes.data) {
        set({ customSources: sourcesRes.data });
      }

      if (catalogRes.success && catalogRes.data) {
        set({
          customCatalog: catalogRes.data.plugins as CatalogPlugin[],
          sourcesRefreshedAt: catalogRes.data.refreshedAt,
        });
      }
    } catch {
      // Non-blocking
    }
  },

  addSource: async (url) => {
    set({ isLoadingSources: true });
    try {
      const result = await pluginSourcesApi.add(url);
      if (result.success && result.data) {
        set((state) => ({
          customSources: [...state.customSources, result.data!],
          isLoadingSources: false,
        }));
        // Auto-refresh to discover plugins from the new source
        await get().refreshSources();
      } else {
        set({ isLoadingSources: false });
      }
    } catch (err) {
      set({ isLoadingSources: false });
      throw err;
    }
  },

  removeSource: async (id) => {
    try {
      await pluginSourcesApi.remove(id);
      set((state) => ({
        customSources: state.customSources.filter((s) => s.id !== id),
        customCatalog: state.customCatalog.filter(
          (p) => p.source_id !== `custom:${id}`
        ),
      }));
    } catch {
      // Silent
    }
  },

  refreshSources: async () => {
    set({ isLoadingSources: true });
    try {
      const result = await pluginSourcesApi.refresh();
      if (result.success && result.data) {
        set({
          customCatalog: result.data.plugins as CatalogPlugin[],
          sourcesRefreshedAt: result.data.refreshedAt,
          isLoadingSources: false,
        });
      } else {
        set({ isLoadingSources: false });
      }
    } catch {
      set({ isLoadingSources: false });
    }
  },
}));
