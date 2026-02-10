import { create } from 'zustand';
import { pluginsApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';
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
    pluginsApi.sync(session.id).catch(() => {});
  }
}

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
  installError: string | null;

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
  clearInstallError: () => void;
  installPlugin: (catalogPlugin: CatalogPlugin) => Promise<void>;
  uninstallPlugin: (repoUrl: string) => Promise<void>;
  syncInstalledPlugins: () => Promise<void>;
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
  installError: null,

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
}));
