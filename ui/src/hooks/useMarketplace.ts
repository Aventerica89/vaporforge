import { create } from 'zustand';
import { pluginsApi, pluginSourcesApi } from '@/lib/api';
import type { PluginSource } from '@/lib/api';
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
    pluginsApi.sync(session.id).catch(console.error);
  }
}

interface MarketplaceState {
  installedRepoUrls: Set<string>;
  installing: Set<string>;
  installError: string | null;

  // Custom sources
  customSources: PluginSource[];
  customCatalog: CatalogPlugin[];
  isLoadingSources: boolean;
  sourcesRefreshedAt: string | null;

  clearInstallError: () => void;
  installPlugin: (catalogPlugin: CatalogPlugin) => Promise<void>;
  uninstallPlugin: (repoUrl: string) => Promise<void>;
  syncInstalledPlugins: () => Promise<void>;
  loadCustomSources: () => Promise<void>;
  addSource: (url: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  refreshSources: () => Promise<void>;
}

export const useMarketplace = create<MarketplaceState>((set, get) => ({
  installedRepoUrls: new Set(),
  installing: new Set(),
  installError: null,
  customSources: [],
  customCatalog: [],
  isLoadingSources: false,
  sourcesRefreshedAt: null,

  clearInstallError: () => set({ installError: null }),

  installPlugin: async (catalogPlugin) => {
    const repoUrl = catalogPlugin.repository_url;
    set((state) => ({
      installing: new Set([...state.installing, catalogPlugin.id]),
      installError: null,
    }));

    try {
      const result = await pluginsApi.discover(repoUrl);

      const discovered = result.success && result.data ? result.data : null;
      const hasDiscoveredContent = discovered &&
        (discovered.agents.length > 0 ||
         discovered.commands.length > 0 ||
         discovered.rules.length > 0);

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
