import { createRouter } from './router';
import { SessionDurableObject } from './websocket';

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
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        return new Response('Missing sessionId', { status: 400 });
      }

      // Route to Durable Object
      const id = env.SESSIONS.idFromName(sessionId);
      const stub = env.SESSIONS.get(id);
      return stub.fetch(request);
    }

    // Create router and handle request
    const router = createRouter(env);
    return router.fetch(request, env, ctx);
  },

  // Scheduled handler for cleanup
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // Cleanup idle sessions
    // This would iterate through sessions and sleep/terminate inactive ones
    // Implementation depends on your session tracking strategy
    console.log('Scheduled cleanup triggered at:', new Date().toISOString());
  },
};
