import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AuthService, extractAuth, KV_USER_TTL } from './auth';
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
import { pluginSourcesRoutes } from './api/plugin-sources';
import { configRoutes } from './api/config';
import { issuesRoutes } from './api/issues-routes';
import { favoritesRoutes } from './api/favorites-routes';
import { githubRoutes } from './api/github-routes';
import { vaporFilesRoutes } from './api/vaporfiles';
import { aiProvidersRoutes } from './api/ai-providers';
import { quickchatRoutes } from './api/quickchat';
import { transformRoutes } from './api/transform';
import { analyzeRoutes } from './api/analyze';
import { commitMsgRoutes } from './api/commit-msg';
import { FileService } from './services/files';
import { DEV_BUILD } from './dev-version';
import { BUILD_HASH, BUILD_DATE, BUILD_TIMESTAMP } from './generated/build-info';
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
      exposeHeaders: ['X-VF-Version', 'X-VF-Dev-Build'],
      credentials: true,
    })
  );

  // Version header — allows clients to detect deploys
  const VF_VERSION = '0.14.2';
  app.use('*', async (c, next) => {
    await next();
    c.header('X-VF-Version', VF_VERSION);
    c.header('X-VF-Dev-Build', String(DEV_BUILD));
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
        version: VF_VERSION,
        devBuild: DEV_BUILD,
        buildHash: BUILD_HASH,
        buildDate: BUILD_DATE,
        buildTimestamp: BUILD_TIMESTAMP,
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

    // Only trust previousUserId if the caller has a valid session JWT proving
    // they are that user. This prevents an attacker from claiming any userId.
    let previousUserId: string | undefined;
    const existingUser = await extractAuth(c.req.raw, authService);
    if (existingUser) {
      previousUserId = existingUser.id;
    }

    const result = await authService.authenticateWithSetupToken(
      parsed.data.token,
      previousUserId
    );
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

  /** Build the list of KV keys that hold user data for migration. */
  function userAuthKvKeys(userId: string): string[] {
    return [
      `issues:${userId}`,
      `favorites:${userId}`,
      `github-username:${userId}`,
    ];
  }

  function userSessionsKvKeys(userId: string): string[] {
    return [
      `user-secrets:${userId}`,
      `user-ai-providers:${userId}`,
      `user-plugins:${userId}`,
      `user-mcp:${userId}`,
      `user-config:${userId}:rules`,
      `user-config:${userId}:commands`,
      `user-config:${userId}:agents`,
      `quickchat-list:${userId}`,
    ];
  }

  /** Migrate KV data from oldUserId to newUserId. Returns count of migrated keys. */
  async function migrateUserData(
    authKv: KVNamespace, sessionsKv: KVNamespace,
    oldUserId: string, newUserId: string
  ): Promise<number> {
    let recovered = 0;

    const oldAuthKeys = userAuthKvKeys(oldUserId);
    const newAuthKeys = userAuthKvKeys(newUserId);
    for (let i = 0; i < oldAuthKeys.length; i++) {
      const value = await authKv.get(oldAuthKeys[i]);
      if (value && !(await authKv.get(newAuthKeys[i]))) {
        await authKv.put(newAuthKeys[i], value);
        recovered++;
      }
    }

    const oldSessionKeys = userSessionsKvKeys(oldUserId);
    const newSessionKeys = userSessionsKvKeys(newUserId);
    for (let i = 0; i < oldSessionKeys.length; i++) {
      const value = await sessionsKv.get(oldSessionKeys[i]);
      if (value && !(await sessionsKv.get(newSessionKeys[i]))) {
        await sessionsKv.put(newSessionKeys[i], value);
        recovered++;
      }
    }

    return recovered;
  }

  // Recover by old Claude token: hash the old token to derive the old userId,
  // then migrate KV data to the current user.
  app.post('/api/auth/recover-by-token', async (c) => {
    const authService = c.get('authService');
    const user = await extractAuth(c.req.raw, authService);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const oldToken = typeof body.oldToken === 'string' ? body.oldToken.trim() : '';

    const validPrefixes = ['sk-ant-oat01-', 'sk-ant-api01-'];
    if (!validPrefixes.some((p) => oldToken.startsWith(p))) {
      return c.json({ success: false, error: 'Invalid token format. Must start with sk-ant-oat01- or sk-ant-api01-' }, 400);
    }

    const oldUserId = await authService.getUserIdFromToken(oldToken);

    if (oldUserId === user.id) {
      return c.json({ success: false, error: 'That token resolves to your current account. Your data should already be visible — try refreshing.' }, 400);
    }

    // Verify the old user record exists
    const oldUser = await env.AUTH_KV.get(`user:${oldUserId}`);
    if (!oldUser) {
      return c.json({ success: false, error: 'No account found for that token. The data may have expired (KV TTL is 30 days).' }, 404);
    }

    const recovered = await migrateUserData(env.AUTH_KV, env.SESSIONS_KV, oldUserId, user.id);

    // Write alias so future logins with the old token resolve here.
    // Only write if no alias exists yet or it already points to this user,
    // to prevent a second caller from hijacking the alias.
    const existingAlias = await env.AUTH_KV.get(`user-alias:${oldUserId}`);
    if (!existingAlias || existingAlias === user.id) {
      await env.AUTH_KV.put(`user-alias:${oldUserId}`, user.id, {
        expirationTtl: KV_USER_TTL,
      });
    }

    // Delete the old user record — data has been migrated and the alias
    // will redirect any future logins with the old token to the new user.
    await env.AUTH_KV.delete(`user:${oldUserId}`);

    return c.json({
      success: true,
      data: { recovered, oldUserId, newUserId: user.id },
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
    const safeName = (file.customMetadata?.originalName || key).replace(/["\r\n\\]/g, '_');
    return new Response(file.body, {
      headers: {
        'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${safeName}"`,
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
  protectedRoutes.route('/plugin-sources', pluginSourcesRoutes);
  protectedRoutes.route('/config', configRoutes);
  protectedRoutes.route('/issues', issuesRoutes);
  protectedRoutes.route('/favorites', favoritesRoutes);
  protectedRoutes.route('/github', githubRoutes);
  protectedRoutes.route('/vaporfiles', vaporFilesRoutes);
  protectedRoutes.route('/ai-providers', aiProvidersRoutes);
  protectedRoutes.route('/quickchat', quickchatRoutes);
  protectedRoutes.route('/transform', transformRoutes);
  protectedRoutes.route('/analyze', analyzeRoutes);
  protectedRoutes.route('/commit-msg', commitMsgRoutes);

  app.route('/api', protectedRoutes);

  // Catch-all for static files (handled by Cloudflare assets)
  app.get('*', (c) => {
    return c.notFound();
  });

  return app;
}
