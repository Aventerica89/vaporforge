import { Hono } from 'hono';
import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { OAuthSession, ClaudeCredentials } from '../types';

// OAuth session TTL (10 minutes)
const OAUTH_SESSION_TTL = 600;

// Polling interval constants
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

// Credentials file path in the container
const CREDENTIALS_PATH = '/root/.claude/.credentials.json';

// Auth code validation pattern (format: XXX#YYY where X and Y are alphanumeric)
const AUTH_CODE_PATTERN = /^[A-Za-z0-9]{3,10}#[A-Za-z0-9]{3,10}$/;

export const oauthRoutes = new Hono<{ Bindings: Env }>();

// Simple in-memory rate limiter (for development; use Durable Objects in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Rate limiting middleware
oauthRoutes.use('*', async (c, next) => {
  const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';

  if (isRateLimited(clientIp)) {
    return c.json({
      success: false,
      error: 'Too many requests. Please try again later.',
    }, 429);
  }

  await next();
});

/**
 * Get or create a sandbox for OAuth authentication
 */
function getOAuthSandbox(
  namespace: DurableObjectNamespace<Sandbox>,
  sessionId: string
): Sandbox {
  return getSandbox(namespace, `oauth_${sessionId}`, {
    sleepAfter: '5m',
    normalizeId: true,
  });
}

/**
 * POST /api/oauth/start
 * Creates an OAuth session and starts the claude login process in a sandbox
 * Returns a client secret that must be provided on subsequent requests
 */
oauthRoutes.post('/start', async (c) => {
  const sessionId = crypto.randomUUID();
  // Generate a client secret for session binding (prevents session hijacking)
  const clientSecret = crypto.randomUUID();

  const session: OAuthSession & { clientSecret: string } = {
    id: sessionId,
    state: 'starting',
    createdAt: new Date().toISOString(),
    clientSecret,
  };

  // Store session in KV
  await c.env.AUTH_KV.put(
    `oauth:${sessionId}`,
    JSON.stringify(session),
    { expirationTtl: OAUTH_SESSION_TTL }
  );

  try {
    // Get sandbox instance
    const sandbox = getOAuthSandbox(c.env.SANDBOX_CONTAINER, sessionId);

    // Create .claude directory
    await sandbox.mkdir('/root/.claude', { recursive: true });

    // Run claude login and capture output to file
    // The --no-browser flag outputs the URL instead of opening a browser
    await sandbox.exec(
      'claude login --no-browser 2>&1 | tee /tmp/auth-output.txt &'
    );

    // Update session state
    session.state = 'waiting_url';
    await c.env.AUTH_KV.put(
      `oauth:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: OAUTH_SESSION_TTL }
    );

    return c.json({
      success: true,
      data: { sessionId, clientSecret },
    });
  } catch (error) {
    session.state = 'error';
    session.error = error instanceof Error ? error.message : 'Failed to start OAuth';
    await c.env.AUTH_KV.put(
      `oauth:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: OAUTH_SESSION_TTL }
    );

    return c.json({
      success: false,
      error: session.error,
    }, 500);
  }
});

/**
 * GET /api/oauth/:sessionId/status
 * Poll for OAuth URL from the sandbox
 * Requires X-Client-Secret header for session binding
 */
oauthRoutes.get('/:sessionId/status', async (c) => {
  const { sessionId } = c.req.param();
  const clientSecret = c.req.header('X-Client-Secret');

  // Get session from KV
  const sessionData = await c.env.AUTH_KV.get(`oauth:${sessionId}`);
  if (!sessionData) {
    return c.json({
      success: false,
      error: 'OAuth session not found or expired',
    }, 404);
  }

  const session = JSON.parse(sessionData) as OAuthSession & { clientSecret?: string };

  // Validate client secret to prevent session hijacking
  if (session.clientSecret && session.clientSecret !== clientSecret) {
    return c.json({
      success: false,
      error: 'Unauthorized',
    }, 403);
  }

  // If already has URL or error, return immediately
  if (session.state === 'has_url' || session.state === 'error') {
    return c.json({
      success: true,
      data: session,
    });
  }

  try {
    const sandbox = getOAuthSandbox(c.env.SANDBOX_CONTAINER, sessionId);

    // Read auth output file
    const outputFile = await sandbox.readFile('/tmp/auth-output.txt');
    const output = outputFile?.content || '';

    // Parse OAuth URL from output
    // Claude login outputs URLs like: https://claude.ai/oauth/...
    const urlMatch = output.match(/https:\/\/claude\.ai\/oauth[^\s]*/);

    if (urlMatch) {
      session.state = 'has_url';
      session.oauthUrl = urlMatch[0];

      await c.env.AUTH_KV.put(
        `oauth:${sessionId}`,
        JSON.stringify(session),
        { expirationTtl: OAUTH_SESSION_TTL }
      );
    }

    return c.json({
      success: true,
      data: session,
    });
  } catch (error) {
    return c.json({
      success: true,
      data: {
        ...session,
        state: 'waiting_url',
      },
    });
  }
});

/**
 * POST /api/oauth/:sessionId/code
 * Submit the auth code and retrieve credentials
 * Requires X-Client-Secret header for session binding
 */
oauthRoutes.post('/:sessionId/code', async (c) => {
  const { sessionId } = c.req.param();
  const clientSecret = c.req.header('X-Client-Secret');
  const body = await c.req.json<{ code: string }>();

  if (!body.code) {
    return c.json({
      success: false,
      error: 'Missing auth code',
    }, 400);
  }

  // Validate code length to prevent oversized inputs
  if (typeof body.code !== 'string' || body.code.length > 50) {
    return c.json({
      success: false,
      error: 'Invalid code',
    }, 400);
  }

  // Validate code format using regex (XXX#YYY where X and Y are alphanumeric)
  if (!AUTH_CODE_PATTERN.test(body.code)) {
    return c.json({
      success: false,
      error: 'Invalid code format',
    }, 400);
  }

  // Get session from KV
  const sessionData = await c.env.AUTH_KV.get(`oauth:${sessionId}`);
  if (!sessionData) {
    return c.json({
      success: false,
      error: 'OAuth session not found or expired',
    }, 404);
  }

  const session = JSON.parse(sessionData) as OAuthSession & { clientSecret?: string };

  // Validate client secret to prevent session hijacking
  if (session.clientSecret && session.clientSecret !== clientSecret) {
    return c.json({
      success: false,
      error: 'Unauthorized',
    }, 403);
  }

  try {
    const sandbox = getOAuthSandbox(c.env.SANDBOX_CONTAINER, sessionId);

    // Write code to file
    await sandbox.writeFile('/tmp/auth-code.txt', body.code);

    // Pipe code to claude login (it should be waiting for input)
    await sandbox.exec('cat /tmp/auth-code.txt | claude login --code');

    // Wait for credentials file to appear
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      const existsResult = await sandbox.exists(CREDENTIALS_PATH);
      if (!existsResult.exists) continue;

      const credsFile = await sandbox.readFile(CREDENTIALS_PATH);
      if (!credsFile?.content) continue;

      try {
        const creds: ClaudeCredentials = JSON.parse(credsFile.content);

        if (creds.claudeAiOauth?.accessToken) {
          // Update session to success
          session.state = 'success';
          await c.env.AUTH_KV.put(
            `oauth:${sessionId}`,
            JSON.stringify(session),
            { expirationTtl: 60 } // Short TTL after success
          );

          return c.json({
            success: true,
            data: {
              state: 'success',
              accessToken: creds.claudeAiOauth.accessToken,
              refreshToken: creds.claudeAiOauth.refreshToken,
              expiresAt: creds.claudeAiOauth.expiresAt,
            },
          });
        }
      } catch {
        // Invalid JSON, keep polling
      }
    }

    // Timeout waiting for credentials
    session.state = 'error';
    session.error = 'Timeout waiting for credentials';
    await c.env.AUTH_KV.put(
      `oauth:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: 60 }
    );

    return c.json({
      success: false,
      error: 'Timeout waiting for credentials',
    }, 408);
  } catch (error) {
    session.state = 'error';
    session.error = error instanceof Error ? error.message : 'Failed to submit code';
    await c.env.AUTH_KV.put(
      `oauth:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: 60 }
    );

    return c.json({
      success: false,
      error: session.error,
    }, 500);
  }
});

/**
 * DELETE /api/oauth/:sessionId
 * Cancel an OAuth session and clean up resources
 */
oauthRoutes.delete('/:sessionId', async (c) => {
  const { sessionId } = c.req.param();

  await c.env.AUTH_KV.delete(`oauth:${sessionId}`);

  return c.json({
    success: true,
    data: { cancelled: true },
  });
});
