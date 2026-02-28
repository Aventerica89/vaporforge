import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { PluginDetail } from './PluginDetail';
import { McpDetail } from './McpDetail';

export function IntegrationsDetail() {
  const { selectedPluginId, selectedMcpName, plugins, mcpServers } =
    useIntegrationsStore();

  // Plugin detail
  if (selectedPluginId) {
    const plugin = plugins.find((p) => p.id === selectedPluginId);
    if (plugin) return <PluginDetail plugin={plugin} />;
  }

  // MCP detail
  if (selectedMcpName) {
    const server = mcpServers.find((s) => s.name === selectedMcpName);
    if (server) return <McpDetail server={server} />;
  }

  // Empty state
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5">
      <span className="text-2xl text-muted-foreground/30">[_]</span>
      <span className="text-[11px] text-muted-foreground">
        Select a plugin or integration
      </span>
    </div>
  );
}
