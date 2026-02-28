import type { McpServerConfig } from '@/lib/types';
import { TRANSPORT_BADGE, STATUS_CONFIG } from './types';
import type { McpStatus } from './types';

interface McpSidebarRowProps {
  server: McpServerConfig;
  status: McpStatus;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

export function McpSidebarRow({
  server,
  status,
  isActive,
  onSelect,
  onToggle,
}: McpSidebarRowProps) {
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.disabled;
  const transportClass = TRANSPORT_BADGE[server.transport] || TRANSPORT_BADGE.http;

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 px-3.5 py-1.5 transition-colors ${
        isActive ? 'bg-card/80' : 'hover:bg-card/40'
      }`}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-500" />
      )}

      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${statusCfg.dot}`}
      />

      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">
          {server.name}
        </span>
        <div className="mt-0.5 flex items-center gap-1 text-[9px]">
          <span
            className={`inline-block rounded-sm border px-1.5 py-px text-[9px] ${transportClass}`}
          >
            {server.transport}
          </span>
        </div>
      </div>

      <button
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          server.enabled ? 'bg-violet-500' : 'bg-muted-foreground/30'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span
          className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
            server.enabled ? 'left-[15px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}
