import { useEffect } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { useMarketplace } from '@/hooks/useMarketplace';
import { IntegrationsSidebar } from './IntegrationsSidebar';
import { IntegrationsDetail } from './IntegrationsDetail';
import { McpAddModal } from './McpAddModal';
import { MarketplaceSlideIn } from './MarketplaceSlideIn';
import { toast } from '@/hooks/useToast';

export function IntegrationsTab() {
  const {
    isLoadingPlugins,
    isLoadingMcps,
    loadPlugins,
    loadMcpServers,
    pingAllMcps,
    sidebarWidth,
    plugins,
    mcpServers,
  } = useIntegrationsStore();

  // Load data on mount — including custom plugin sources for MarketplaceSlideIn
  useEffect(() => {
    loadPlugins();
    loadMcpServers().then(() => pingAllMcps());
    useMarketplace.getState().loadCustomSources();
  }, [loadPlugins, loadMcpServers, pingAllMcps]);

  // Handle OAuth callback redirect: /app/#settings/integrations?oauth_success=serverName
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('oauth_success=')) return;

    const queryPart = hash.split('?')[1] ?? '';
    const params = new URLSearchParams(queryPart);
    const serverName = params.get('oauth_success');

    if (serverName) {
      toast(`Connected to ${serverName}`, 'success');
      loadMcpServers();
      // Remove oauth_success param from URL without triggering navigation
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
    }
  }, []);

  const enabledPlugins = plugins.filter((p: { enabled: boolean }) => p.enabled).length;
  const enabledMcps = mcpServers.filter((s: { enabled: boolean }) => s.enabled).length;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#21262d] bg-[#0d1117] px-5">
        <span className="font-['Space_Mono'] text-[12px] font-semibold uppercase tracking-[1px] text-[#cdd9e5]">
          Integrations
        </span>
        <div className="flex items-center gap-[20px]">
          <span className="font-['Space_Mono'] text-[10px] text-[#8b949e]">
            {enabledPlugins}/{plugins.length} Plugins
          </span>
          <span className="font-['Space_Mono'] text-[10px] text-[#8b949e]">
            {enabledMcps}/{mcpServers.length} MCPs
          </span>
          {(isLoadingPlugins || isLoadingMcps) && (
            <span className="text-[10px] text-primary/60 animate-pulse">loading...</span>
          )}
        </div>
      </div>

      {/* Master / Detail */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div style={{ width: sidebarWidth }} className="shrink-0 h-full overflow-hidden">
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
