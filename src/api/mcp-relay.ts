import { Hono } from 'hono';
import type { Session } from '../types';

/**
 * MCP Relay Route — bridges HTTP requests from the in-container proxy
 * to the SessionDurableObject, which relays them via WebSocket to the browser.
 *
 * Auth: Uses a session-scoped relay token (not the user's JWT).
 * Route: POST /api/mcp-relay/:sessionId/:serverName
 */
export const mcpRelayRoutes = new Hono<{ Bindings: Env }>();

mcpRelayRoutes.post('/:sessionId/:serverName', async (c) => {
  const sessionId = c.req.param('sessionId');
  const serverName = c.req.param('serverName');

  // Validate relay token from Authorization header
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return c.json({ error: 'Missing relay token' }, 401);
  }

  // Look up session in KV to validate relay token
  const session = await c.env.SESSIONS_KV.get<Session>(
    `session:${sessionId}`,
    'json'
  );

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const expectedToken = (session.metadata as Record<string, unknown>)?.relayToken;
  if (!expectedToken || token !== expectedToken) {
    return c.json({ error: 'Invalid relay token' }, 403);
  }

  // Read the JSON-RPC request body
  const body = await c.req.json();

  // Forward to SessionDurableObject
  const doId = c.env.SESSIONS.idFromName(sessionId);
  const stub = c.env.SESSIONS.get(doId);

  const doResponse = await stub.fetch(
    new Request('http://internal/mcp-relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        serverName,
        body,
      }),
    })
  );

  // Return the DO's response directly
  const result = await doResponse.json();
  return c.json(result, doResponse.status as 200);
});
