import type { User, AuthTokenPayloadType } from './types';

const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Simple JWT-like token creation using Web Crypto API
async function createToken(
  payload: AuthTokenPayloadType,
  secret: string
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${sig}`;
}

async function verifyToken(
  token: string,
  secret: string
): Promise<AuthTokenPayloadType | null> {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const data = `${header}.${body}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(data)
    );

    if (!valid) return null;

    const payload = JSON.parse(atob(body)) as AuthTokenPayloadType;

    // Check expiry
    if (payload.exp < Date.now() / 1000) return null;

    return payload;
  } catch {
    return null;
  }
}

export class AuthService {
  constructor(
    private kv: KVNamespace,
    private jwtSecret: string
  ) {}

  // Create or get user from Claude OAuth access token (sk-ant-oat01-...)
  // previousUserId: hint from the client (stored in localStorage) to reuse
  // the same userId when the OAuth token rotates, preserving all KV data.
  async getOrCreateUser(claudeToken: string, previousUserId?: string): Promise<User | null> {
    const tokenHash = await this.hashToken(claudeToken);
    const userId = `user_${tokenHash.slice(0, 16)}`;

    // 1. Check if this exact token already has a user
    const existingUser = await this.kv.get<User>(`user:${userId}`, 'json');
    if (existingUser) {
      if (existingUser.claudeToken !== claudeToken) {
        existingUser.claudeToken = claudeToken;
        await this.kv.put(`user:${userId}`, JSON.stringify(existingUser), {
          expirationTtl: 30 * 24 * 60 * 60,
        });
      }
      return existingUser;
    }

    // 2. Token is new — check if client sent a previousUserId hint.
    //    If that old user exists, update it with the new token so all
    //    KV data (issues, secrets, plugins, etc.) stays reachable.
    if (previousUserId && previousUserId !== userId) {
      const previousUser = await this.kv.get<User>(`user:${previousUserId}`, 'json');
      if (previousUser) {
        previousUser.claudeToken = claudeToken;
        // Re-persist under the SAME key so all `{previousUserId}` KV data stays valid
        await this.kv.put(`user:${previousUserId}`, JSON.stringify(previousUser), {
          expirationTtl: 30 * 24 * 60 * 60,
        });
        // Also store a forward pointer so the new token hash resolves too
        await this.kv.put(`user-alias:${userId}`, previousUserId, {
          expirationTtl: 30 * 24 * 60 * 60,
        });
        return previousUser;
      }
    }

    // 3. Check if a previous token rotation left a forward alias for this hash.
    //    This makes login self-healing even when the client hint is missing
    //    (e.g. after a hard refresh that clears localStorage).
    const aliasedUserId = await this.kv.get(`user-alias:${userId}`);
    if (aliasedUserId) {
      const aliasedUser = await this.kv.get<User>(`user:${aliasedUserId}`, 'json');
      if (aliasedUser) {
        aliasedUser.claudeToken = claudeToken;
        await this.kv.put(`user:${aliasedUserId}`, JSON.stringify(aliasedUser), {
          expirationTtl: 30 * 24 * 60 * 60,
        });
        // Refresh the alias TTL
        await this.kv.put(`user-alias:${userId}`, aliasedUserId, {
          expirationTtl: 30 * 24 * 60 * 60,
        });
        return aliasedUser;
      }
    }

    // 4. Truly new user — create fresh record
    const user: User = {
      id: userId,
      email: `${userId}@claude-cloud.local`,
      claudeToken,
      createdAt: new Date().toISOString(),
    };

    await this.kv.put(`user:${userId}`, JSON.stringify(user), {
      expirationTtl: 30 * 24 * 60 * 60,
    });

    return user;
  }

  // Create session token for user
  async createSessionToken(user: User): Promise<string> {
    const payload: AuthTokenPayloadType = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + TOKEN_EXPIRY) / 1000),
    };

    return createToken(payload, this.jwtSecret);
  }

  // Verify session token
  async verifySessionToken(token: string): Promise<AuthTokenPayloadType | null> {
    return verifyToken(token, this.jwtSecret);
  }

  // Get user from session token
  async getUserFromToken(token: string): Promise<User | null> {
    const payload = await this.verifySessionToken(token);
    if (!payload) return null;

    return this.kv.get<User>(`user:${payload.sub}`, 'json');
  }

  // Authenticate with setup token (from `claude setup-token`)
  // The token (sk-ant-oat01-...) is an OAuth access token for Claude Code.
  // It can't be validated via the Messages API (OAuth not supported there).
  // Instead we validate the format and store it for use by Claude Code
  // running inside the sandbox.
  async authenticateWithSetupToken(
    token: string,
    previousUserId?: string
  ): Promise<{ user: User; sessionToken: string } | null> {
    // Validate token format - must be a recognized Anthropic token prefix
    const validPrefixes = ['sk-ant-oat01-', 'sk-ant-api01-'];
    const hasValidPrefix = validPrefixes.some((p) => token.startsWith(p));

    if (!hasValidPrefix) {
      return null;
    }

    // Create user from the token, passing previousUserId to preserve data
    const user = await this.getOrCreateUser(token, previousUserId);
    if (!user) return null;

    const sessionToken = await this.createSessionToken(user);
    return { user, sessionToken };
  }

  // Refresh Claude OAuth token
  async refreshClaudeToken(userId: string): Promise<string | null> {
    const refreshData = await this.kv.get<{
      refreshToken: string;
      expiresAt: number;
    }>(`refresh:${userId}`, 'json');

    if (!refreshData?.refreshToken) {
      return null;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshData.refreshToken,
          client_id: 'claude-desktop', // Official client ID
        }).toString(),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      // Update user's token
      const user = await this.kv.get<User>(`user:${userId}`, 'json');
      if (user) {
        user.claudeToken = data.access_token;
        await this.kv.put(`user:${userId}`, JSON.stringify(user), {
          expirationTtl: 30 * 24 * 60 * 60,
        });

        // Update refresh token if provided
        if (data.refresh_token) {
          const expiresAt = data.expires_in
            ? Date.now() + data.expires_in * 1000
            : refreshData.expiresAt;

          await this.kv.put(
            `refresh:${userId}`,
            JSON.stringify({
              refreshToken: data.refresh_token,
              expiresAt,
            }),
            { expirationTtl: 30 * 24 * 60 * 60 }
          );
        }
      }

      return data.access_token;
    } catch {
      return null;
    }
  }

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Middleware helper to extract and validate auth
export async function extractAuth(
  request: Request,
  authService: AuthService
): Promise<User | null> {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      return authService.getUserFromToken(token);
    }
  }

  // Check cookie
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/session=([^;]+)/);
    if (match) {
      return authService.getUserFromToken(match[1]);
    }
  }

  return null;
}
