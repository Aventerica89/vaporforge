import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AuthService, extractAuth } from './auth';
import { SandboxManager } from './sandbox';
import { chatRoutes } from './api/chat';
import { fileRoutes } from './api/files';
import { sessionRoutes } from './api/sessions';
import { gitRoutes } from './api/git';
import { sdkRoutes } from './api/sdk';
import { userRoutes } from './api/user';
import { secretsRoutes } from './api/secrets';
import { mcpRoutes } from './api/mcp';
import { mcpRelayRoutes } from './api/mcp-relay';
import { pluginsRoutes } from './api/plugins';
import { configRoutes } from './api/config';
import { issuesRoutes } from './api/issues-routes';
import { favoritesRoutes } from './api/favorites-routes';
import { githubRoutes } from './api/github-routes';
import { vaporFilesRoutes } from './api/vaporfiles';
import { aiProvidersRoutes } from './api/ai-providers';
import { quickchatRoutes } from './api/quickchat';
import { transformRoutes } from './api/transform';
import { FileService } from './services/files';
import { SetupTokenRequestSchema } from './types';
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
          'https://vaporforge.dev',
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
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-VF-Version'],
      credentials: true,
    })
  );

  // Version header — allows clients to detect deploys
  const VF_VERSION = '0.9.5';
  app.use('*', async (c, next) => {
    await next();
    c.header('X-VF-Version', VF_VERSION);
  });

  // Initialize services
  app.use('*', async (c, next) => {
    const authService = new AuthService(
      env.AUTH_KV,
      env.JWT_SECRET
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

  // Setup-token auth endpoint (public)
  app.post('/api/auth/setup', async (c) => {
    const authService = c.get('authService');
    const body = await c.req.json();

    const parsed = SetupTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid token format' }, 400);
    }

    const result = await authService.authenticateWithSetupToken(parsed.data.token);
    if (!result) {
      return c.json({
        success: false,
        error: 'Invalid token format. Token must start with sk-ant-oat01- or sk-ant-api01-',
      }, 401);
    }

    return c.json({
      success: true,
      data: {
        sessionToken: result.sessionToken,
        user: {
          id: result.user.id,
          email: result.user.email,
        },
      },
    });
  });

  // MCP relay route (uses relay token auth, not user JWT)
  app.route('/api/mcp-relay', mcpRelayRoutes);

  // Public file download endpoint (no auth required)
  app.get('/files/:key', async (c) => {
    const key = c.req.param('key');
    const fileService = new FileService(
      env.FILES_BUCKET,
      `https://${new URL(c.req.url).host}`
    );

    const file = await fileService.getFile(key);
    if (!file) {
      return c.notFound();
    }

    // Set caching headers (1 year since files are immutable)
    return new Response(file.body, {
      headers: {
        'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${file.customMetadata?.originalName || key}"`,
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
  protectedRoutes.route('/sdk', sdkRoutes);
  protectedRoutes.route('/user', userRoutes);
  protectedRoutes.route('/secrets', secretsRoutes);
  protectedRoutes.route('/mcp', mcpRoutes);
  protectedRoutes.route('/plugins', pluginsRoutes);
  protectedRoutes.route('/config', configRoutes);
  protectedRoutes.route('/issues', issuesRoutes);
  protectedRoutes.route('/favorites', favoritesRoutes);
  protectedRoutes.route('/github', githubRoutes);
  protectedRoutes.route('/vaporfiles', vaporFilesRoutes);
  protectedRoutes.route('/ai-providers', aiProvidersRoutes);
  protectedRoutes.route('/quickchat', quickchatRoutes);
  protectedRoutes.route('/transform', transformRoutes);

  app.route('/api', protectedRoutes);

  // Catch-all for static files (handled by Cloudflare assets)
  app.get('*', (c) => {
    return c.notFound();
  });

  return app;
}
