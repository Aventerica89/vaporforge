import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AuthService, extractAuth } from './auth';
import { SandboxManager } from './sandbox';
import { chatRoutes } from './api/chat';
import { fileRoutes } from './api/files';
import { sessionRoutes } from './api/sessions';
import { gitRoutes } from './api/git';
import { oauthRoutes } from './api/oauth';
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

  // CORS with restricted origins
  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow requests with no origin (same-origin, mobile apps)
        if (!origin) return '*';

        const allowedOrigins = [
          'https://vaporforge.jbcloud.app',
        ];

        // Allow localhost in development
        if (env.ENVIRONMENT === 'development') {
          allowedOrigins.push(
            'http://localhost:5173',
            'http://localhost:8787',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:8787'
          );
        }

        return allowedOrigins.includes(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Secret'],
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
      env.SANDBOX_CONTAINER,
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

  // OAuth routes (no auth required - for 1Code-style login)
  app.route('/api/oauth', oauthRoutes);

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

  // Claude OAuth token auth endpoint (for 1Code-style login)
  app.post('/api/auth/claude-token', async (c) => {
    const authService = c.get('authService');
    const body = await c.req.json<{
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
    }>();

    if (!body.accessToken) {
      return c.json({ success: false, error: 'Missing access token' }, 400);
    }

    const user = await authService.authenticateWithClaudeToken(
      body.accessToken,
      body.refreshToken,
      body.expiresAt
    );

    if (!user) {
      return c.json({ success: false, error: 'Authentication failed' }, 401);
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
