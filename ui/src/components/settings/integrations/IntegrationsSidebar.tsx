import { useCallback, useRef } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { PluginSidebarList } from './PluginSidebarList';
import { McpSidebarList } from './McpSidebarList';

export function IntegrationsSidebar() {
  const { activeTab, setActiveTab, sidebarWidth, setSidebarWidth, plugins, mcpServers } =
    useIntegrationsStore();

  const enabledPlugins = plugins.filter((p) => p.enabled).length;
  const enabledMcps = mcpServers.filter((s) => s.enabled).length;

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        setSidebarWidth(dragRef.current.startWidth + dx);
      };

      const onUp = () => {
        dragRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [sidebarWidth, setSidebarWidth]
  );

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col overflow-hidden bg-[#0d1117]"
      style={{ width: sidebarWidth, minWidth: 220, maxWidth: 500 }}
    >
      {/* Tab row */}
      <div className="flex shrink-0 gap-[6px] border-b border-[#21262d] px-[12px] pt-[10px] pb-[9px]">
        <button
          className={`flex flex-1 items-center justify-center gap-[6px] rounded-full border px-0 py-[5px] font-['Space_Mono'] text-[11px] font-bold transition-all ${
            activeTab === 'plugins'
              ? 'border-[#00e5ff33] bg-[#00e5ff0a] text-[#00e5ff]'
              : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-foreground'
          }`}
          onClick={() => setActiveTab('plugins')}
        >
          Plugins
          <span className={`text-[10px] font-semibold ${activeTab === 'plugins' ? 'text-[#00e5ff]' : 'text-[#8b949e]'}`}>
            {enabledPlugins}/{plugins.length}
          </span>
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-[6px] rounded-full border px-0 py-[5px] font-['Space_Mono'] text-[11px] font-bold transition-all ${
            activeTab === 'mcps'
              ? 'border-[#a371f747] bg-[#a371f71a] text-[#a371f7]'
              : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-foreground'
          }`}
          onClick={() => setActiveTab('mcps')}
        >
          MCPs
          <span className={`text-[10px] font-semibold ${activeTab === 'mcps' ? 'text-[#a371f7]' : 'text-[#8b949e]'}`}>
            {enabledMcps}/{mcpServers.length}
          </span>
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-[6px] rounded-full border px-0 py-[5px] font-['Space_Mono'] text-[11px] font-bold transition-all ${
            activeTab === 'github'
              ? 'border-[#f0883e47] bg-[#f0883e1a] text-[#f0883e]'
              : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-foreground'
          }`}
          onClick={() => setActiveTab('github')}
        >
          GitHub
        </button>
      </div>

      {/* Conditional list */}
      {activeTab === 'plugins' && <PluginSidebarList />}
      {activeTab === 'mcps' && <McpSidebarList />}
      {activeTab === 'github' && (
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="font-['Space_Mono'] text-[10px] text-[#484f58]">
            GitHub settings shown in detail panel
          </span>
        </div>
      )}

      {/* Drag handle */}
      <div
        className="absolute bottom-0 right-0 top-0 z-10 w-[5px] cursor-col-resize"
        onMouseDown={onDragStart}
      >
        <div className="absolute bottom-0 right-0 top-0 w-px bg-[#30363d] transition-colors hover:bg-primary" />
      </div>
    </aside>
  );
}
