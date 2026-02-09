import { useMcpRelayStatus } from '@/hooks/useMcpRelayStatus';
import { Radio } from 'lucide-react';

/**
 * Compact relay status indicator. Shows only when relay servers are configured.
 * - Green dot: connected, all servers reachable
 * - Yellow dot: connected, some servers unreachable
 * - Red dot: disconnected
 */
export function McpRelayStatus() {
  const { isConnected, unreachableServers, relayServerCount } = useMcpRelayStatus();

  if (relayServerCount === 0) return null;

  const hasUnreachable = unreachableServers.length > 0;

  const dotColor = !isConnected
    ? 'bg-red-400'
    : hasUnreachable
      ? 'bg-yellow-400'
      : 'bg-green-400';

  const label = !isConnected
    ? 'Relay disconnected'
    : hasUnreachable
      ? `${unreachableServers.length} server(s) unreachable`
      : `${relayServerCount} relay server(s) active`;

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
      title={label}
    >
      <Radio className="h-3 w-3" />
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
