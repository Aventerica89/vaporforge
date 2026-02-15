import { createRouter } from './router';
import { SessionDurableObject } from './websocket';
// Sandbox class is provided by @cloudflare/sandbox SDK
export { Sandbox } from '@cloudflare/sandbox';

export { SessionDurableObject };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const url = new URL(request.url);

      // SDK WebSocket streaming — route through Hono (auth + sandbox proxy)
      if (url.pathname === '/api/sdk/ws') {
        const router = createRouter(env);
        return router.fetch(request, env, ctx);
      }

      // All other WS — route to Durable Object (MCP relay, etc.)
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        return new Response('Missing sessionId', { status: 400 });
      }
      const id = env.SESSIONS.idFromName(sessionId);
      const stub = env.SESSIONS.get(id);
      return stub.fetch(request);
    }

    // Create router and handle request
    const router = createRouter(env);
    return router.fetch(request, env, ctx);
  },

  // Scheduled handler: purge pending-delete sessions after 5 days
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('[cleanup] Scheduled cleanup triggered at:', new Date().toISOString());

    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let purged = 0;

    // Iterate all sessions
    const list = await env.SESSIONS_KV.list({ prefix: 'session:' });

    for (const key of list.keys) {
      const session = await env.SESSIONS_KV.get<{
        id: string;
        status: string;
        metadata?: Record<string, unknown>;
      }>(key.name, 'json');
      if (!session || session.status !== 'pending-delete') continue;

      const scheduledAt = session.metadata?.deleteScheduledAt as string | undefined;
      if (!scheduledAt) continue;

      const elapsed = now - new Date(scheduledAt).getTime();
      if (elapsed < FIVE_DAYS_MS) continue;

      // Time's up — purge session and its messages
      const sessionId = session.id;

      // Delete all messages for this session
      const msgList = await env.SESSIONS_KV.list({ prefix: `message:${sessionId}:` });
      for (const msgKey of msgList.keys) {
        await env.SESSIONS_KV.delete(msgKey.name);
      }

      // Delete the session itself
      await env.SESSIONS_KV.delete(key.name);
      purged++;
      console.log(`[cleanup] Purged session ${sessionId.slice(0, 8)} (pending-delete for ${Math.floor(elapsed / 86400000)}d)`);
    }

    console.log(`[cleanup] Done. Purged ${purged} sessions.`);
  },
};
