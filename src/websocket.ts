import type { WSMessage } from './types';

export class WebSocketHandler {
  private connections: Map<string, WebSocket> = new Map();
  private sessionConnections: Map<string, Set<string>> = new Map();

  // Handle new WebSocket connection
  handleConnection(
    ws: WebSocket,
    connectionId: string,
    sessionId: string
  ): void {
    this.connections.set(connectionId, ws);

    // Track session connections
    const sessionConns = this.sessionConnections.get(sessionId) || new Set();
    sessionConns.add(connectionId);
    this.sessionConnections.set(sessionId, sessionConns);

    // Set up heartbeat
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(connectionId, { type: 'ping' });
      }
    }, 30000);

    // Handle close
    ws.addEventListener('close', () => {
      clearInterval(pingInterval);
      this.connections.delete(connectionId);

      const conns = this.sessionConnections.get(sessionId);
      if (conns) {
        conns.delete(connectionId);
        if (conns.size === 0) {
          this.sessionConnections.delete(sessionId);
        }
      }
    });
  }

  // Send message to specific connection
  send(connectionId: string, message: WSMessage): boolean {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify(message));
    return true;
  }

  // Broadcast to all connections in a session
  broadcastToSession(sessionId: string, message: WSMessage): void {
    const connections = this.sessionConnections.get(sessionId);
    if (!connections) return;

    const messageStr = JSON.stringify(message);
    for (const connId of connections) {
      const ws = this.connections.get(connId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Stream chat response
  async streamResponse(
    sessionId: string,
    messageId: string,
    stream: AsyncIterable<string>
  ): Promise<void> {
    this.broadcastToSession(sessionId, {
      type: 'stream_start',
      messageId,
    });

    for await (const chunk of stream) {
      this.broadcastToSession(sessionId, {
        type: 'stream_delta',
        messageId,
        delta: chunk,
      });
    }

    this.broadcastToSession(sessionId, {
      type: 'stream_end',
      messageId,
    });
  }

  // Send tool call notification
  notifyToolCall(
    sessionId: string,
    messageId: string,
    tool: string,
    input: Record<string, unknown>
  ): void {
    this.broadcastToSession(sessionId, {
      type: 'tool_call',
      messageId,
      tool,
      input,
    });
  }

  // Send tool result notification
  notifyToolResult(
    sessionId: string,
    messageId: string,
    output: string
  ): void {
    this.broadcastToSession(sessionId, {
      type: 'tool_result',
      messageId,
      output,
    });
  }

  // Send file change notification
  notifyFileChange(
    sessionId: string,
    path: string,
    action: 'create' | 'update' | 'delete'
  ): void {
    this.broadcastToSession(sessionId, {
      type: 'file_change',
      path,
      action,
    });
  }

  // Send terminal output
  notifyTerminalOutput(sessionId: string, output: string): void {
    this.broadcastToSession(sessionId, {
      type: 'terminal_output',
      sessionId,
      output,
    });
  }

  // Send error
  notifyError(sessionId: string, message: string, code?: string): void {
    this.broadcastToSession(sessionId, {
      type: 'error',
      message,
      code,
    });
  }

  // Get connection count for session
  getSessionConnectionCount(sessionId: string): number {
    return this.sessionConnections.get(sessionId)?.size || 0;
  }

  // Check if session has active connections
  hasActiveConnections(sessionId: string): boolean {
    return this.getSessionConnectionCount(sessionId) > 0;
  }
}

/** Pending MCP relay request awaiting browser response */
interface PendingRelayRequest {
  resolve: (body: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const RELAY_TIMEOUT_MS = 30000;

// Durable Object for WebSocket state persistence
export class SessionDurableObject {
  private state: DurableObjectState;
  private wsHandler: WebSocketHandler;
  private sessions: Map<string, { userId: string; createdAt: string }> = new Map();
  private pendingRelayRequests: Map<string, PendingRelayRequest> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.wsHandler = new WebSocketHandler();

    // Restore state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<
        Map<string, { userId: string; createdAt: string }>
      >('sessions');
      if (stored) {
        this.sessions = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        return new Response('Missing sessionId', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const connectionId = crypto.randomUUID();

      server.accept();
      this.wsHandler.handleConnection(server, connectionId, sessionId);

      // Listen for mcp_relay_response messages from browser
      server.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'mcp_relay_response' && data.requestId) {
            const pending = this.pendingRelayRequests.get(data.requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              this.pendingRelayRequests.delete(data.requestId);
              if (data.error) {
                pending.resolve({
                  jsonrpc: '2.0',
                  error: { code: -32603, message: data.error },
                });
              } else {
                pending.resolve(data.body || {});
              }
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // REST API for session management
    if (url.pathname === '/session' && request.method === 'POST') {
      const body = await request.json() as {
        sessionId: string;
        userId: string;
      };

      this.sessions.set(body.sessionId, {
        userId: body.userId,
        createdAt: new Date().toISOString(),
      });

      await this.state.storage.put('sessions', this.sessions);

      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.json() as {
        sessionId: string;
        message: WSMessage;
      };

      this.wsHandler.broadcastToSession(body.sessionId, body.message);
      return new Response(JSON.stringify({ success: true }));
    }

    // MCP relay: forward request to browser via WebSocket and wait for response
    if (url.pathname === '/mcp-relay' && request.method === 'POST') {
      const body = await request.json() as {
        sessionId: string;
        serverName: string;
        body: Record<string, unknown>;
      };

      if (!this.wsHandler.hasActiveConnections(body.sessionId)) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'No browser connected for relay' },
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const requestId = crypto.randomUUID();

      // Create a Promise that will be resolved by the WS message handler
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRelayRequests.delete(requestId);
          resolve({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Relay request timed out (30s)' },
          });
        }, RELAY_TIMEOUT_MS);

        this.pendingRelayRequests.set(requestId, { resolve, reject, timeout });

        // Send relay request to the first connected browser client
        this.wsHandler.broadcastToSession(body.sessionId, {
          type: 'mcp_relay_request',
          requestId,
          serverName: body.serverName,
          body: body.body,
        } as WSMessage);
      });

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }
}
