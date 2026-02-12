import { useEffect, useRef, useCallback, useState } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useMcpRelay } from '@/hooks/useMcpRelay';
import { useMcpRelayStatus } from '@/hooks/useMcpRelayStatus';
import { mcpApi } from '@/lib/api';
import type { WSMessage } from '@/lib/types';

/**
 * McpRelayProvider — manages a WebSocket connection to the Durable Object
 * for MCP relay traffic. Only connects when a session is active.
 *
 * This is separate from the SDK streaming (which uses HTTP SSE) — the WS
 * connection is exclusively for relaying MCP requests from the container
 * to local MCP servers running on the user's machine.
 */
export function McpRelayProvider({ children }: { children: React.ReactNode }) {
  const currentSession = useSandboxStore((s) => s.currentSession);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { setConnected, setUnreachable, setRelayServerCount } = useMcpRelayStatus();

  // Sync local state with global store
  useEffect(() => {
    setConnected(isConnected);
  }, [isConnected, setConnected]);

  // Send function for the relay hook
  const send = useCallback((message: WSMessage): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const { onMessage } = useMcpRelay(send, isConnected);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Health-check relay servers when WS connects
  useEffect(() => {
    if (!isConnected) return;

    (async () => {
      try {
        const result = await mcpApi.list();
        if (!result.success || !result.data) return;

        const relayServers = result.data.filter(
          (s) => s.transport === 'relay' && s.enabled && s.localUrl
        );
        setRelayServerCount(relayServers.length);

        if (relayServers.length === 0) return;

        const unreachable: string[] = [];
        for (const server of relayServers) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch(server.localUrl!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 0 }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
          } catch {
            unreachable.push(server.name);
          }
        }

        setUnreachable(unreachable);

        if (unreachable.length > 0) {
          console.warn(
            `[MCP Relay] Unreachable local servers: ${unreachable.join(', ')}`
          );
        }
      } catch {
        // Failed to check — non-critical
      }
    })();
  }, [isConnected, setRelayServerCount, setUnreachable]);

  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId) {
      // No session — clean up any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      setIsConnected(false);
      setRelayServerCount(0);
      setUnreachable([]);
      return;
    }

    let attempts = 0;

    function connect() {
      // Prevent double-connection during React StrictMode remount
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        attempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;

          // Handle ping/pong keepalive
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Forward to relay handler
          onMessageRef.current(message);
        } catch {
          // Ignore invalid messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        reconnectRef.current = window.setTimeout(() => {
          attempts++;
          connect();
        }, delay);
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [currentSession?.id, setRelayServerCount, setUnreachable]);

  return <>{children}</>;
}
