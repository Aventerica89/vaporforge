import { createRouter } from './router';
import { SessionDurableObject } from './websocket';
import { ChatSessionAgent } from './agents/chat-session-agent';
// Sandbox class is provided by @cloudflare/sandbox SDK
export { Sandbox } from '@cloudflare/sandbox';
import { proxyToSandbox } from '@cloudflare/sandbox';
import { verifyExecutionToken } from './utils/jwt';
import { AuthService, extractAuth } from './auth';

export { SessionDurableObject, ChatSessionAgent };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Preview URL proxy — intercepts requests to exposed sandbox ports
    // URL format: https://{port}-{sandboxId}-{token}.vaporforge.dev
    // proxyToSandbox expects env.Sandbox but our binding is SANDBOX_CONTAINER
    const proxyResponse = await proxyToSandbox(request, {
      ...env,
      Sandbox: env.SANDBOX_CONTAINER,
    });
    if (proxyResponse) return proxyResponse;

    // V1.5: Route container streaming POST to ChatSessionAgent DO.
    // JWT validated in Worker to prevent attackers from waking arbitrary DOs.
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/internal/stream'
    ) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const payload = await verifyExecutionToken(token, env.JWT_SECRET);
      if (!payload) {
        return new Response('Unauthorized', { status: 401 });
      }
      const id = env.CHAT_SESSIONS.idFromName(payload.sessionId);
      return env.CHAT_SESSIONS.get(id).fetch(request);
    }

    // V1.5: Browser HTTP streaming endpoint — authenticates user,
    // routes to ChatSessionAgent DO which dispatches container.
    const url = new URL(request.url);
    if (
      request.method === 'POST' &&
      url.pathname === '/api/v15/chat'
    ) {
      const authService = new AuthService(env.AUTH_KV, env.JWT_SECRET);
      const user = await extractAuth(request, authService);
      if (!user) {
        return new Response('Unauthorized', { status: 401 });
      }

      const body = (await request.json()) as {
        sessionId?: string;
        prompt?: string;
        mode?: string;
        model?: string;
        autonomy?: string;
      };
      if (!body.sessionId || !body.prompt) {
        return new Response('Missing sessionId or prompt', {
          status: 400,
        });
      }

      const doId = env.CHAT_SESSIONS.idFromName(body.sessionId);
      const stub = env.CHAT_SESSIONS.get(doId);
      return stub.fetch(
        new Request('https://do/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const url = new URL(request.url);

      // WS paths that need auth + sandbox proxy (routed through Hono)
      if (url.pathname === '/api/sdk/ws' || url.pathname === '/api/agency/edit-ws') {
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

    // Create router and handle API requests
    const router = createRouter(env);
    const routerResponse = await router.fetch(request, env, ctx);

    // If router returned 404, delegate to static assets (SPA)
    // With run_worker_first: true, we must explicitly serve assets
    if (routerResponse.status === 404 && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return routerResponse;
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
