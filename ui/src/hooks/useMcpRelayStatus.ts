import { create } from 'zustand';

interface McpRelayStatus {
  /** WebSocket connected to DO for relay traffic */
  isConnected: boolean;
  /** Relay servers that failed health check on connect */
  unreachableServers: string[];
  /** Number of configured relay servers */
  relayServerCount: number;
  setConnected: (connected: boolean) => void;
  setUnreachable: (servers: string[]) => void;
  setRelayServerCount: (count: number) => void;
}

export const useMcpRelayStatus = create<McpRelayStatus>((set) => ({
  isConnected: false,
  unreachableServers: [],
  relayServerCount: 0,
  setConnected: (connected) => set({ isConnected: connected }),
  setUnreachable: (servers) => set({ unreachableServers: servers }),
  setRelayServerCount: (count) => set({ relayServerCount: count }),
}));
