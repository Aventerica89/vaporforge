import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { PluginDetail } from './PluginDetail';
import { McpDetail } from './McpDetail';
import { GroupDetail } from './GroupDetail';

export function IntegrationsDetail() {
  const { selectedPluginId, selectedMcpName, selectedGroupKey, selectedGroupName, selectedGroupPlugins, plugins, mcpServers } =
    useIntegrationsStore();

  // Group detail
  if (selectedGroupKey && selectedGroupName && selectedGroupPlugins) {
    return <GroupDetail groupName={selectedGroupName} plugins={selectedGroupPlugins} />;
  }

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
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2.5">
      <span className="font-['Space_Mono'] text-2xl text-[#768390]/30">[_]</span>
      <span className="font-['Space_Mono'] text-[11px] text-[#768390]">
        Select a plugin or integration
      </span>
    </div>
  );
}
