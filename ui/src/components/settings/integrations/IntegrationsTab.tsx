import { useEffect } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { IntegrationsSidebar } from './IntegrationsSidebar';
import { IntegrationsDetail } from './IntegrationsDetail';
import { McpAddModal } from './McpAddModal';
import { MarketplaceSlideIn } from './MarketplaceSlideIn';

export function IntegrationsTab() {
  const {
    plugins,
    mcpServers,
    isLoadingPlugins,
    isLoadingMcps,
    loadPlugins,
    loadMcpServers,
    pingAllMcps,
    sidebarWidth,
  } = useIntegrationsStore();

  // Load data on mount
  useEffect(() => {
    loadPlugins();
    loadMcpServers().then(() => pingAllMcps());
  }, [loadPlugins, loadMcpServers, pingAllMcps]);

  const pluginCount = plugins.length;
  const mcpCount = mcpServers.length;
  const enabledPlugins = plugins.filter((p) => p.enabled).length;
  const enabledMcps = mcpServers.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header stats */}
      <div className="flex shrink-0 items-center gap-5 border-b border-border/40 px-5 py-3">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Integrations
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            <span className="font-bold text-foreground">{enabledPlugins}</span>
            /{pluginCount} plugins
          </span>
          <span className="text-border">|</span>
          <span>
            <span className="font-bold text-foreground">{enabledMcps}</span>
            /{mcpCount} servers
          </span>
        </div>
        {(isLoadingPlugins || isLoadingMcps) && (
          <span className="animate-pulse text-[9px] text-primary/60">loading...</span>
        )}
      </div>

      {/* Master / Detail */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div style={{ width: sidebarWidth }} className="shrink-0 h-full overflow-hidden border-r border-border">
          <IntegrationsSidebar />
        </div>
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          <IntegrationsDetail />
        </div>
      </div>

      {/* Overlays */}
      <McpAddModal />
      <MarketplaceSlideIn />
    </div>
  );
}
