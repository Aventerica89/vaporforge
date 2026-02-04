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

// Durable Object for WebSocket state persistence
export class SessionDurableObject {
  private state: DurableObjectState;
  private wsHandler: WebSocketHandler;
  private sessions: Map<string, { userId: string; createdAt: string }> = new Map();

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

    return new Response('Not found', { status: 404 });
  }
}
