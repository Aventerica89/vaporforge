import type { McpServerConfig } from '@/lib/types';
import type { McpStatus } from './types';

interface McpSidebarRowProps {
  server: McpServerConfig;
  status: McpStatus;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

const DOT_STYLES: Record<McpStatus, string> = {
  connected: 'bg-[#3fb950] shadow-[0_0_4px_#3fb950]',
  error: 'bg-[#f85149] shadow-[0_0_4px_#f85149]',
  'auth-required': 'bg-[#e3b341] shadow-[0_0_4px_#e3b341]',
  'auth-expired': 'bg-[#e3b341] shadow-[0_0_4px_#e3b341]',
  disabled: 'bg-[#768390]',
};

export function McpSidebarRow({
  server,
  status,
  isActive,
  onSelect,
  onToggle,
}: McpSidebarRowProps) {
  return (
    <div
      className={`group relative flex h-[38px] cursor-pointer items-center gap-2 px-[14px] py-[7px] transition-colors ${
        isActive ? 'bg-[#ffffff08]' : 'hover:bg-[#ffffff08]'
      }`}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#a371f7]" />
      )}

      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT_STYLES[status] || DOT_STYLES.disabled}`}
      />

      <span
        className={`flex-1 truncate font-['Space_Mono'] text-[12px] ${
          server.enabled ? 'text-[#cdd9e5]' : 'text-[#768390]'
        }`}
      >
        {server.name}
      </span>

      <button
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          server.enabled ? 'bg-[#a371f7]' : 'bg-[#768390]/30'
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
