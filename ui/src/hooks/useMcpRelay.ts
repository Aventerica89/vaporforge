import { useCallback, useEffect, useRef } from 'react';
import { mcpApi } from '@/lib/api';
import type { McpServerConfig, WSMessage } from '@/lib/types';

const RELAY_TIMEOUT_MS = 25000;

/**
 * useMcpRelay — handles MCP relay requests from the WebSocket.
 *
 * When the DO sends an `mcp_relay_request` message, this hook:
 * 1. Looks up the server's localUrl from the cached relay server config
 * 2. Forwards the JSON-RPC body to the local MCP server
 * 3. Sends the response back as `mcp_relay_response` via WebSocket
 */
export function useMcpRelay(
  send: (message: WSMessage) => boolean,
  isConnected: boolean
) {
  const relayServersRef = useRef<McpServerConfig[]>([]);

  // Load relay servers on mount and when connection changes
  useEffect(() => {
    if (!isConnected) return;

    mcpApi.list().then((result) => {
      if (result.success && result.data) {
        relayServersRef.current = result.data.filter(
          (s) => s.transport === 'relay' && s.enabled && s.localUrl
        );
      }
    });
  }, [isConnected]);

  const handleRelayRequest = useCallback(
    async (requestId: string, serverName: string, body: Record<string, unknown>) => {
      const server = relayServersRef.current.find((s) => s.name === serverName);

      if (!server || !server.localUrl) {
        send({
          type: 'mcp_relay_response',
          requestId,
          body: {},
          error: `Relay server "${serverName}" not found or has no localUrl`,
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);

      try {
        const response = await fetch(server.localUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const result = await response.json();

        send({
          type: 'mcp_relay_response',
          requestId,
          body: result as Record<string, unknown>,
        });
      } catch (err) {
        const message = err instanceof Error
          ? err.name === 'AbortError'
            ? 'Local MCP server timed out (25s)'
            : err.message
          : 'Unknown relay error';

        send({
          type: 'mcp_relay_response',
          requestId,
          body: {},
          error: message,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    [send]
  );

  // Returns a message handler to be called from the WS onMessage
  const onMessage = useCallback(
    (message: WSMessage) => {
      if (message.type === 'mcp_relay_request') {
        handleRelayRequest(message.requestId, message.serverName, message.body);
      }
    },
    [handleRelayRequest]
  );

  return { onMessage };
}
