import { Hono } from 'hono';
import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { OAuthSession, ClaudeCredentials } from '../types';

// OAuth session TTL (10 minutes)
const OAUTH_SESSION_TTL = 600;

// Polling interval constants
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 500;

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

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
 * Create the login script that handles the OAuth flow
 */
function createLoginScript(): string {
  return `#!/bin/bash
set -e

# Create .claude directory
mkdir -p /root/.claude

# Log start
echo "Starting claude login..." > /tmp/auth-output.txt
echo "Timestamp: $(date)" >> /tmp/auth-output.txt

# Check if claude command exists
if ! command -v claude &> /dev/null; then
  echo "ERROR: claude command not found" >> /tmp/auth-output.txt
  echo "PATH: $PATH" >> /tmp/auth-output.txt
  which -a claude 2>&1 >> /tmp/auth-output.txt || true
  exit 1
fi

# Run claude login and capture output
# Using script command to capture PTY output
script -q -c "claude login 2>&1" /tmp/auth-pty.txt &
LOGIN_PID=$!

# Wait for URL to appear (up to 30 seconds)
for i in {1..30}; do
  sleep 1
  if grep -q "claude.ai" /tmp/auth-pty.txt 2>/dev/null; then
    # Extract and save the OAuth URL
    grep -oE 'https://[^ ]+claude[^ ]*' /tmp/auth-pty.txt >> /tmp/auth-output.txt
    echo "URL_READY" >> /tmp/auth-output.txt
    break
  fi
done

# Keep the login process info
echo "LOGIN_PID=$LOGIN_PID" >> /tmp/auth-output.txt
`;
}

/**
 * Create script to submit auth code
 */
function createCodeSubmitScript(code: string): string {
  // Escape any special characters in the code
  const escapedCode = code.replace(/'/g, "'\\''");

  return `#!/bin/bash
set -e

echo "Submitting auth code..." >> /tmp/auth-output.txt

# Method 1: Try using expect if available
if command -v expect &> /dev/null; then
  expect << 'EXPECT_EOF'
spawn claude login
expect {
  "*claude.ai*" {
    send "${escapedCode}\\r"
    expect eof
  }
  timeout {
    exit 1
  }
}
EXPECT_EOF
else
  # Method 2: Use claude auth command directly if it exists
  echo '${escapedCode}' | claude login 2>&1 >> /tmp/auth-output.txt || true

  # Method 3: Try writing directly to credentials file format
  # This is a fallback if the CLI doesn't accept piped input
fi

echo "Code submission attempted" >> /tmp/auth-output.txt
`;
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

    // First, check if claude is available and capture version info
    let claudeCheck: { stdout?: string; stderr?: string } | undefined;
    try {
      claudeCheck = await sandbox.exec('which claude && claude --version 2>&1 || echo "claude not found"');
    } catch {
      claudeCheck = undefined;
    }

    // Write the login script
    const loginScript = createLoginScript();
    await sandbox.writeFile('/tmp/login.sh', loginScript);
    await sandbox.exec('chmod +x /tmp/login.sh');

    // Run the login script in background with nohup
    await sandbox.exec('nohup /tmp/login.sh > /tmp/login-script.log 2>&1 &');

    // Update session state with debug info
    session.state = 'waiting_url';
    await c.env.AUTH_KV.put(
      `oauth:${sessionId}`,
      JSON.stringify({
        ...session,
        debug: {
          claudeCheck: claudeCheck?.stdout || claudeCheck?.stderr || 'check failed',
        },
      }),
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

  const session = JSON.parse(sessionData) as OAuthSession & {
    clientSecret?: string;
    debug?: { claudeCheck?: string; output?: string };
  };

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

    // Read all output files for debugging
    let authOutput = '';
    let scriptLog = '';
    let ptyOutput = '';

    try {
      const authFile = await sandbox.readFile('/tmp/auth-output.txt');
      authOutput = authFile?.content || '';
    } catch {
      // File may not exist yet
    }

    try {
      const logFile = await sandbox.readFile('/tmp/login-script.log');
      scriptLog = logFile?.content || '';
    } catch {
      // File may not exist yet
    }

    try {
      const ptyFile = await sandbox.readFile('/tmp/auth-pty.txt');
      ptyOutput = ptyFile?.content || '';
    } catch {
      // File may not exist yet
    }

    const combinedOutput = `${authOutput}\n${scriptLog}\n${ptyOutput}`;

    // Check for errors
    if (combinedOutput.includes('ERROR:') || combinedOutput.includes('claude not found')) {
      session.state = 'error';
      session.error = 'Claude CLI not available in sandbox';
      session.debug = { output: combinedOutput.slice(0, 500) };

      await c.env.AUTH_KV.put(
        `oauth:${sessionId}`,
        JSON.stringify(session),
        { expirationTtl: OAUTH_SESSION_TTL }
      );

      return c.json({
        success: true,
        data: session,
      });
    }

    // Parse OAuth URL from output
    // Claude login outputs URLs like: https://claude.ai/oauth/...
    const urlPatterns = [
      /https:\/\/claude\.ai\/oauth[^\s\n"]*/,
      /https:\/\/[^\s\n"]*claude[^\s\n"]*oauth[^\s\n"]*/,
      /https:\/\/[^\s\n"]*anthropic[^\s\n"]*auth[^\s\n"]*/,
    ];

    let foundUrl: string | null = null;
    for (const pattern of urlPatterns) {
      const match = combinedOutput.match(pattern);
      if (match) {
        foundUrl = match[0];
        break;
      }
    }

    if (foundUrl) {
      session.state = 'has_url';
      session.oauthUrl = foundUrl;
      session.debug = { output: combinedOutput.slice(0, 200) };

      await c.env.AUTH_KV.put(
        `oauth:${sessionId}`,
        JSON.stringify(session),
        { expirationTtl: OAUTH_SESSION_TTL }
      );
    } else {
      // Still waiting, update debug info
      session.debug = { output: combinedOutput.slice(0, 200) };
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
        debug: { error: error instanceof Error ? error.message : 'Unknown error' },
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

    // Write the code submit script
    const codeScript = createCodeSubmitScript(body.code);
    await sandbox.writeFile('/tmp/submit-code.sh', codeScript);
    await sandbox.exec('chmod +x /tmp/submit-code.sh');

    // Run the code submission script
    await sandbox.exec('/tmp/submit-code.sh');

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
