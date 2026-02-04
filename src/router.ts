import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AuthService, extractAuth } from './auth';
import { SandboxManager } from './sandbox';
import { chatRoutes } from './api/chat';
import { fileRoutes } from './api/files';
import { sessionRoutes } from './api/sessions';
import { gitRoutes } from './api/git';
import type { User } from './types';

// Extend Hono context
type Variables = {
  user: User;
  authService: AuthService;
  sandboxManager: SandboxManager;
};

export function createRouter(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  // Middleware
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // Initialize services
  app.use('*', async (c, next) => {
    const authService = new AuthService(
      env.AUTH_KV,
      env.JWT_SECRET,
      env.CLAUDE_CLIENT_ID,
      env.CLAUDE_CLIENT_SECRET
    );

    const sandboxManager = new SandboxManager(
      env.claude_sandbox,
      env.SESSIONS_KV,
      env.FILES_BUCKET
    );

    c.set('authService', authService);
    c.set('sandboxManager', sandboxManager);

    await next();
  });

  // Health check
  app.get('/api/health', (c) => {
    return c.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Auth routes (no auth required)
  app.get('/api/auth/login', async (c) => {
    const authService = c.get('authService');
    const redirectUri = c.req.query('redirect_uri') || `${new URL(c.req.url).origin}/api/auth/callback`;
    const state = crypto.randomUUID();

    // Store state for CSRF protection
    await env.AUTH_KV.put(`oauth_state:${state}`, 'pending', {
      expirationTtl: 300, // 5 minutes
    });

    const url = authService.getOAuthUrl(redirectUri, state);
    return c.redirect(url);
  });

  app.get('/api/auth/callback', async (c) => {
    const authService = c.get('authService');
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code || !state) {
      return c.json({ success: false, error: 'Missing code or state' }, 400);
    }

    // Verify state
    const storedState = await env.AUTH_KV.get(`oauth_state:${state}`);
    if (!storedState) {
      return c.json({ success: false, error: 'Invalid state' }, 400);
    }

    await env.AUTH_KV.delete(`oauth_state:${state}`);

    const redirectUri = `${new URL(c.req.url).origin}/api/auth/callback`;
    const tokens = await authService.exchangeCode(code, redirectUri);

    if (!tokens) {
      return c.json(
        { success: false, error: 'Failed to exchange code' },
        400
      );
    }

    const user = await authService.getOrCreateUser(tokens.accessToken);
    if (!user) {
      return c.json({ success: false, error: 'Failed to create user' }, 500);
    }

    const sessionToken = await authService.createSessionToken(user);

    // Set cookie and redirect
    return c.html(`
      <html>
        <head>
          <script>
            document.cookie = "session=${sessionToken}; path=/; max-age=${24 * 60 * 60}; samesite=lax";
            window.location.href = "/";
          </script>
        </head>
        <body>Redirecting...</body>
      </html>
    `);
  });

  // API key auth endpoint
  app.post('/api/auth/api-key', async (c) => {
    const authService = c.get('authService');
    const body = await c.req.json<{ apiKey: string }>();

    if (!body.apiKey) {
      return c.json({ success: false, error: 'Missing API key' }, 400);
    }

    const user = await authService.authenticateWithApiKey(body.apiKey);
    if (!user) {
      return c.json({ success: false, error: 'Invalid API key' }, 401);
    }

    const sessionToken = await authService.createSessionToken(user);

    return c.json({
      success: true,
      data: {
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    });
  });

  // Protected routes - require authentication
  const protectedRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

  protectedRoutes.use('*', async (c, next) => {
    const authService = c.get('authService');
    const user = await extractAuth(c.req.raw, authService);

    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    c.set('user', user);
    await next();
  });

  // Mount API routes
  protectedRoutes.route('/chat', chatRoutes);
  protectedRoutes.route('/files', fileRoutes);
  protectedRoutes.route('/sessions', sessionRoutes);
  protectedRoutes.route('/git', gitRoutes);

  app.route('/api', protectedRoutes);

  // Catch-all for static files (handled by Cloudflare assets)
  app.get('*', (c) => {
    return c.notFound();
  });

  return app;
}
