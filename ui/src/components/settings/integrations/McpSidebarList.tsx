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
      <div className="shrink-0 border-b border-[#21262d] px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#1c2128] px-2.5 py-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#768390" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={mcpSearch}
            onChange={(e) => setMcpSearch(e.target.value)}
            placeholder="Search MCP servers..."
            className="w-full bg-transparent font-['Space_Mono'] text-[11px] text-foreground focus-visible:outline-none placeholder:text-[#768390]"
          />
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto pt-[16px]">
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
      </div>

      {/* Add Integration button */}
      <div className="shrink-0 px-3 pb-3">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#30363d] bg-[#161b22] px-[16px] py-[12px] font-['Space_Mono'] text-[11px] font-bold text-[#768390] transition-colors hover:border-[#a371f747] hover:text-[#a371f7]"
          onClick={() => setShowMcpAddModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Integration
        </button>
      </div>
    </div>
  );
}
