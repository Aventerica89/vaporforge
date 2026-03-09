import { useEffect } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { useMarketplace } from '@/hooks/useMarketplace';
import { IntegrationsSidebar } from './IntegrationsSidebar';
import { IntegrationsDetail } from './IntegrationsDetail';
import { McpAddModal } from './McpAddModal';
import { MarketplaceSlideIn } from './MarketplaceSlideIn';

export function IntegrationsTab() {
  const {
    isLoadingPlugins,
    isLoadingMcps,
    loadPlugins,
    loadMcpServers,
    pingAllMcps,
    sidebarWidth,
  } = useIntegrationsStore();

  // Load data on mount — including custom plugin sources for MarketplaceSlideIn
  useEffect(() => {
    loadPlugins();
    loadMcpServers().then(() => pingAllMcps());
    useMarketplace.getState().loadCustomSources();
  }, [loadPlugins, loadMcpServers, pingAllMcps]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Loading indicator — counts live in the sidebar tab buttons */}
      {(isLoadingPlugins || isLoadingMcps) && (
        <div className="shrink-0 px-5 py-1.5 text-[10px] text-primary/60 animate-pulse border-b border-border/40">
          loading...
        </div>
      )}

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
