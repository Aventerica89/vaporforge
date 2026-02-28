import { useMemo } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { McpSidebarRow } from './McpSidebarRow';

export function McpSidebarList() {
  const {
    mcpServers,
    mcpSearch,
    setMcpSearch,
    mcpStatuses,
    selectedMcpName,
    selectMcp,
    toggleMcp,
    setShowMcpAddModal,
  } = useIntegrationsStore();

  const filtered = useMemo(() => {
    const search = mcpSearch.toLowerCase().trim();
    if (!search) return mcpServers;
    return mcpServers.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.transport.toLowerCase().includes(search)
    );
  }, [mcpServers, mcpSearch]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="shrink-0 border-b border-border/40 px-3 py-2">
        <input
          type="text"
          value={mcpSearch}
          onChange={(e) => setMcpSearch(e.target.value)}
          placeholder="Search MCP servers..."
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500"
        />
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto pb-4 pt-1">
        {filtered.map((server) => (
          <McpSidebarRow
            key={server.name}
            server={server}
            status={
              !server.enabled
                ? 'disabled'
                : mcpStatuses[server.name] || 'disabled'
            }
            isActive={selectedMcpName === server.name}
            onSelect={() => selectMcp(server.name)}
            onToggle={() => toggleMcp(server.name)}
          />
        ))}

        <button
          className="flex w-full items-center gap-1.5 px-3.5 py-2 text-[11px] text-muted-foreground transition-colors hover:text-violet-400"
          onClick={() => setShowMcpAddModal(true)}
        >
          + Add Integration
        </button>
      </div>
    </div>
  );
}
