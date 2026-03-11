import { create } from 'zustand';
import { pluginsApi, pluginSourcesApi } from '@/lib/api';
import type { PluginSource } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { CatalogPlugin } from '@/lib/generated/catalog-types';
import type { Plugin } from '@/lib/types';
import { toast } from '@/hooks/useToast';

const MAX_ITEMS_PER_CATEGORY = 10;

/** Map catalog source_id to a human-readable package name */
function deriveSourceName(sourceId: string): string {
  const KNOWN_SOURCES: Record<string, string> = {
    'anthropic-official': 'Anthropic Official',
    'awesome-community': 'Awesome CC Plugins',
  };
  if (KNOWN_SOURCES[sourceId]) return KNOWN_SOURCES[sourceId];
  if (sourceId.startsWith('custom:')) {
    const id = sourceId.slice('custom:'.length);
    const source = useMarketplace.getState().customSources.find((s) => s.id === id);
    return source?.label ?? sourceId;
  }
  return sourceId;
}

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
async function syncToActiveSession(): Promise<void> {
  const session = useSandboxStore.getState().currentSession;
  if (!session?.id) return;
  try {
    await pluginsApi.sync(session.id);
    toast.success('Synced to active session');
  } catch {
    toast.info('Plugin installed — restart session to activate');
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
  sourceWarnings: Record<string, string[]>;

  clearInstallError: () => void;
  installPlugin: (catalogPlugin: CatalogPlugin) => Promise<void>;
  uninstallPlugin: (repoUrl: string) => Promise<void>;
  syncInstalledPlugins: () => Promise<void>;
  loadCustomSources: () => Promise<void>;
  addSource: (url: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  patchSource: (id: string, data: Partial<Pick<PluginSource, 'autoUpdate' | 'label'>>) => Promise<void>;
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
  sourceWarnings: {},

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
        sourceId: catalogPlugin.source_id,
        sourceName: deriveSourceName(catalogPlugin.source_id),
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
        installing: (() => {
          const next = new Set(state.installing);
          next.delete(catalogPlugin.id);
          return next;
        })(),
      }));
      toast.success(`${catalogPlugin.name} installed`);
      syncToActiveSession();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      set({ installError: `Failed to install ${catalogPlugin.name}: ${msg}` });
    } finally {
      // Clear installing state (only reached on error path now — success returns early)
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

      const sources = sourcesRes.success && sourcesRes.data ? sourcesRes.data : [];
      if (sources.length > 0) {
        set({ customSources: sources });
      }

      const catalogPlugins = catalogRes.success && catalogRes.data ? catalogRes.data.plugins : [];
      if (catalogRes.success && catalogRes.data) {
        set({
          customCatalog: catalogPlugins as CatalogPlugin[],
          sourcesRefreshedAt: catalogRes.data.refreshedAt,
        });
      }

      // Auto-refresh if we have sources but no cached catalog
      if (sources.length > 0 && catalogPlugins.length === 0) {
        await get().refreshSources();
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
      // Remove installed plugins from this source
      const { plugins, removePlugins } = useIntegrationsStore.getState();
      const fromSource = plugins.filter((p) => p.sourceId === `custom:${id}`);
      if (fromSource.length > 0) {
        await removePlugins(fromSource);
      }
    } catch {
      // Silent
    }
  },

  patchSource: async (id, data) => {
    try {
      const result = await pluginSourcesApi.patch(id, data);
      if (result.success && result.data) {
        set((state) => ({
          customSources: state.customSources.map((s) =>
            s.id === id ? result.data! : s
          ),
        }));
      }
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
          sourceWarnings: (result.data.warnings as Record<string, string[]>) ?? {},
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
