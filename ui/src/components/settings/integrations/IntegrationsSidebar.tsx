import { useCallback, useRef } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import { PluginSidebarList } from './PluginSidebarList';
import { McpSidebarList } from './McpSidebarList';

export function IntegrationsSidebar() {
  const { activeTab, setActiveTab, sidebarWidth, setSidebarWidth } =
    useIntegrationsStore();

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
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-card/50"
      style={{ width: sidebarWidth, minWidth: 220, maxWidth: 500 }}
    >
      {/* Tab row */}
      <div className="flex shrink-0 gap-1.5 border-b border-border px-3 py-2.5">
        <button
          className={`flex-1 rounded-full border px-2 py-1 text-center font-mono text-[11px] transition-all ${
            activeTab === 'plugins'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('plugins')}
        >
          Plugins
        </button>
        <button
          className={`flex-1 rounded-full border px-2 py-1 text-center font-mono text-[11px] transition-all ${
            activeTab === 'mcps'
              ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('mcps')}
        >
          MCPs
        </button>
      </div>

      {/* Conditional list */}
      {activeTab === 'plugins' ? <PluginSidebarList /> : <McpSidebarList />}

      {/* Drag handle */}
      <div
        className="absolute bottom-0 right-0 top-0 z-10 w-[5px] cursor-col-resize"
        onMouseDown={onDragStart}
      >
        <div className="absolute bottom-0 right-0 top-0 w-px bg-border transition-colors hover:bg-primary" />
      </div>
    </aside>
  );
}
