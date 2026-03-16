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
  // or ?oauth_error=access_denied etc.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('oauth_success=') && !hash.includes('oauth_error=')) return;

    const queryPart = hash.split('?')[1] ?? '';
    const params = new URLSearchParams(queryPart);
    const serverName = params.get('oauth_success');
    const oauthError = params.get('oauth_error');

    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (serverName) {
      toast(`Connected to ${serverName}`, 'success');
      loadMcpServers();
      // Notify the original tab that OAuth completed (this tab is the popup)
      try {
        new BroadcastChannel('vf-mcp-oauth').postMessage({ type: 'oauth_complete', serverName });
      } catch {
        // BroadcastChannel not supported (rare)
      }
    } else if (oauthError) {
      const msg =
        oauthError === 'access_denied'
          ? 'Authorization denied'
          : oauthError === 'state_expired'
            ? 'OAuth session expired — try again'
            : 'OAuth failed — try again';
      toast(msg, 'error');
    }
  }, []);

  // Listen for OAuth completion from popup tab — reload servers so status updates
  useEffect(() => {
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel('vf-mcp-oauth');
      ch.onmessage = (e) => {
        if (e.data?.type === 'oauth_complete') {
          useIntegrationsStore.getState().loadMcpServers();
          toast(`Connected to ${e.data.serverName as string}`, 'success');
        }
      };
    } catch {
      return;
    }
    return () => ch.close();
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
