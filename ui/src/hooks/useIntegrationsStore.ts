import { create } from 'zustand';
import { pluginsApi, mcpApi } from '@/lib/api';
import type { Plugin, McpServerConfig } from '@/lib/types';
import type { ViewTab, McpStatus } from '@/components/settings/integrations/types';
import { toast } from '@/hooks/useToast';
import { useMarketplace } from '@/hooks/useMarketplace';

interface IntegrationsState {
  // Tab + selection
  activeTab: ViewTab;
  selectedPluginId: string | null;
  selectedMcpName: string | null;

  // Data
  plugins: Plugin[];
  mcpServers: McpServerConfig[];
  mcpStatuses: Record<string, McpStatus>;

  // Loading
  isLoadingPlugins: boolean;
  isLoadingMcps: boolean;

  // Search
  pluginSearch: string;
  mcpSearch: string;

  // Layout
  sidebarWidth: number;

  // Modals
  showMcpAddModal: boolean;
  showMarketplace: boolean;

  // Expanded component items (plugin detail)
  expandedItems: Set<string>;

  // File preview selection
  selectedFile: { pluginId: string; path: string } | null;
  fileViewMode: 'rendered' | 'raw';

  // Scope (visual-only for now)
  pluginScopes: Record<string, 'global' | 'project'>;

  // Tier collapse state
  tierCollapsed: Record<string, boolean>;

  // Confirm-remove state
  confirmRemove: string | null;

  // Actions
  setActiveTab: (tab: ViewTab) => void;
  selectPlugin: (id: string | null) => void;
  selectMcp: (name: string | null) => void;
  setPluginSearch: (q: string) => void;
  setMcpSearch: (q: string) => void;
  setSidebarWidth: (w: number) => void;
  setShowMcpAddModal: (v: boolean) => void;
  setShowMarketplace: (v: boolean) => void;
  toggleExpanded: (key: string) => void;
  selectFile: (pluginId: string, path: string) => void;
  clearFile: () => void;
  setFileViewMode: (mode: 'rendered' | 'raw') => void;
  setPluginScope: (pluginId: string, scope: 'global' | 'project') => void;
  toggleTier: (tier: string) => void;
  setConfirmRemove: (id: string | null) => void;

  // Data actions
  loadPlugins: () => Promise<void>;
  loadMcpServers: () => Promise<void>;
  pingAllMcps: () => Promise<void>;
  togglePlugin: (id: string) => Promise<void>;
  toggleMcp: (name: string) => Promise<void>;
  togglePluginItem: (pluginId: string, itemType: string, itemName: string) => Promise<void>;
  removePlugin: (id: string) => Promise<void>;
  removeMcp: (name: string) => Promise<void>;
  addMcpServer: (server: Omit<McpServerConfig, 'addedAt' | 'enabled'>) => Promise<void>;
}

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 500;

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  activeTab: 'plugins',
  selectedPluginId: null,
  selectedMcpName: null,
  plugins: [],
  mcpServers: [],
  mcpStatuses: {},
  isLoadingPlugins: false,
  isLoadingMcps: false,
  pluginSearch: '',
  mcpSearch: '',
  sidebarWidth: 300,
  showMcpAddModal: false,
  showMarketplace: false,
  expandedItems: new Set(),
  selectedFile: null,
  fileViewMode: 'rendered',
  pluginScopes: {},
  tierCollapsed: {},
  confirmRemove: null,

  setActiveTab: (tab) => set({ activeTab: tab, confirmRemove: null }),
  selectPlugin: (id) => set({
    selectedPluginId: id,
    selectedMcpName: null,
    confirmRemove: null,
    selectedFile: null,
  }),
  selectMcp: (name) => set({
    selectedMcpName: name,
    selectedPluginId: null,
    confirmRemove: null,
    selectedFile: null,
  }),
  setPluginSearch: (q) => set({ pluginSearch: q }),
  setMcpSearch: (q) => set({ mcpSearch: q }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w)) }),
  setShowMcpAddModal: (v) => set({ showMcpAddModal: v }),
  setShowMarketplace: (v) => set({ showMarketplace: v }),
  toggleExpanded: (key) => set((state) => {
    const next = new Set(state.expandedItems);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { expandedItems: next };
  }),
  selectFile: (pluginId, path) => set({ selectedFile: { pluginId, path } }),
  clearFile: () => set({ selectedFile: null }),
  setFileViewMode: (mode) => set({ fileViewMode: mode }),
  setPluginScope: (pluginId, scope) => set((state) => ({
    pluginScopes: { ...state.pluginScopes, [pluginId]: scope },
  })),
  toggleTier: (tier) => set((state) => ({
    tierCollapsed: { ...state.tierCollapsed, [tier]: !state.tierCollapsed[tier] },
  })),
  setConfirmRemove: (id) => set({ confirmRemove: id }),

  loadPlugins: async () => {
    set({ isLoadingPlugins: true });
    try {
      const result = await pluginsApi.list();
      if (result.success && result.data) {
        set({ plugins: result.data });
      }
    } catch {
      toast.error('Failed to load plugins');
    } finally {
      set({ isLoadingPlugins: false });
    }
  },

  loadMcpServers: async () => {
    set({ isLoadingMcps: true });
    try {
      const result = await mcpApi.list();
      if (result.success && result.data) {
        set({ mcpServers: result.data });
      }
    } catch {
      toast.error('Failed to load MCP servers');
    } finally {
      set({ isLoadingMcps: false });
    }
  },

  pingAllMcps: async () => {
    try {
      const result = await mcpApi.ping();
      if (result.success && result.data) {
        const statuses: Record<string, McpStatus> = {};
        for (const [name, info] of Object.entries(result.data)) {
          statuses[name] = info.status === 'ok' ? 'connected' : 'error';
        }
        // Mark disabled servers
        const { mcpServers } = get();
        for (const server of mcpServers) {
          if (!server.enabled) {
            statuses[server.name] = 'disabled';
          }
        }
        set({ mcpStatuses: statuses });
      }
    } catch {
      // Non-blocking
    }
  },

  togglePlugin: async (id) => {
    const { plugins } = get();
    const plugin = plugins.find((p) => p.id === id);
    if (!plugin) return;

    // Optimistic update
    set({
      plugins: plugins.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });

    try {
      await pluginsApi.toggle(id, { enabled: !plugin.enabled });
    } catch {
      // Rollback
      set({ plugins });
      toast.error('Failed to toggle plugin');
    }
  },

  toggleMcp: async (name) => {
    const { mcpServers } = get();
    const server = mcpServers.find((s) => s.name === name);
    if (!server) return;

    // Optimistic update
    set({
      mcpServers: mcpServers.map((s) =>
        s.name === name ? { ...s, enabled: !s.enabled } : s
      ),
    });

    try {
      await mcpApi.toggle(name);
    } catch {
      // Rollback
      set({ mcpServers });
      toast.error('Failed to toggle MCP server');
    }
  },

  togglePluginItem: async (pluginId, itemType, itemName) => {
    const { plugins } = get();
    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    const items = plugin[itemType as keyof Pick<Plugin, 'agents' | 'commands' | 'rules'>];
    if (!Array.isArray(items)) return;
    const item = items.find((i) => i.name === itemName);
    if (!item) return;

    // Optimistic update
    set({
      plugins: plugins.map((p) =>
        p.id === pluginId
          ? {
              ...p,
              [itemType]: items.map((i) =>
                i.name === itemName ? { ...i, enabled: !i.enabled } : i
              ),
            }
          : p
      ),
    });

    try {
      await pluginsApi.toggle(pluginId, {
        enabled: !item.enabled,
        itemType,
        itemName,
      });
    } catch {
      set({ plugins });
      toast.error('Failed to toggle item');
    }
  },

  removePlugin: async (id) => {
    const plugin = get().plugins.find((p) => p.id === id);
    try {
      await pluginsApi.remove(id);
      set((state) => ({
        plugins: state.plugins.filter((p) => p.id !== id),
        selectedPluginId: state.selectedPluginId === id ? null : state.selectedPluginId,
        confirmRemove: null,
      }));
      // Sync marketplace installed state so it shows as uninstalled
      if (plugin?.repoUrl) {
        const mkt = useMarketplace.getState();
        const next = new Set(mkt.installedRepoUrls);
        next.delete(plugin.repoUrl);
        useMarketplace.setState({ installedRepoUrls: next });
      }
      toast.success('Plugin removed');
    } catch {
      toast.error('Failed to remove plugin');
    }
  },

  removeMcp: async (name) => {
    try {
      await mcpApi.remove(name);
      set((state) => ({
        mcpServers: state.mcpServers.filter((s) => s.name !== name),
        selectedMcpName: state.selectedMcpName === name ? null : state.selectedMcpName,
        confirmRemove: null,
      }));
      toast.success('MCP server removed');
    } catch {
      toast.error('Failed to remove MCP server');
    }
  },

  addMcpServer: async (server) => {
    try {
      const result = await mcpApi.add(server);
      if (result.success && result.data) {
        set((state) => ({
          mcpServers: [...state.mcpServers, result.data!],
          showMcpAddModal: false,
        }));
        toast.success(`${server.name} added`);
      }
    } catch {
      toast.error('Failed to add MCP server');
    }
  },
}));
