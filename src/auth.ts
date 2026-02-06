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
  async getOrCreateUser(claudeToken: string): Promise<User | null> {
    const tokenHash = await this.hashToken(claudeToken);
    const userId = `user_${tokenHash.slice(0, 16)}`;

    const existingUser = await this.kv.get<User>(`user:${userId}`, 'json');
    if (existingUser) {
      // Update token if different
      if (existingUser.claudeToken !== claudeToken) {
        existingUser.claudeToken = claudeToken;
        await this.kv.put(`user:${userId}`, JSON.stringify(existingUser), {
          expirationTtl: 30 * 24 * 60 * 60, // 30 days
        });
      }
      return existingUser;
    }

    const user: User = {
      id: userId,
      email: `${userId}@claude-cloud.local`,
      claudeToken,
      createdAt: new Date().toISOString(),
    };

    await this.kv.put(`user:${userId}`, JSON.stringify(user), {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days
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
  // Tries multiple auth methods since token type determines the header.
  async authenticateWithSetupToken(
    token: string
  ): Promise<{ user: User; sessionToken: string; error?: string } | null> {
    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const errors: string[] = [];

    // Method 1: Authorization: Bearer (for OAuth access tokens)
    const bearerResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
      },
      body: requestBody,
    });

    if (bearerResp.status !== 401 && bearerResp.status !== 403) {
      const user = await this.getOrCreateUser(token);
      if (!user) return null;
      const sessionToken = await this.createSessionToken(user);
      return { user, sessionToken };
    }

    const bearerErr = await bearerResp.text();
    errors.push(`Bearer: ${bearerResp.status} ${bearerErr}`);

    // Method 2: x-api-key (for API keys)
    const apiKeyResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
      },
      body: requestBody,
    });

    if (apiKeyResp.status !== 401 && apiKeyResp.status !== 403) {
      const user = await this.getOrCreateUser(token);
      if (!user) return null;
      const sessionToken = await this.createSessionToken(user);
      return { user, sessionToken };
    }

    const apiKeyErr = await apiKeyResp.text();
    errors.push(`x-api-key: ${apiKeyResp.status} ${apiKeyErr}`);

    // Method 3: Try as refresh token exchange
    const refreshResp = await fetch('https://api.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: 'claude-desktop',
      }).toString(),
    });

    if (refreshResp.ok) {
      const data = await refreshResp.json() as {
        access_token: string;
        refresh_token?: string;
      };
      // Use the exchanged access token
      const user = await this.getOrCreateUser(data.access_token);
      if (!user) return null;
      const sessionToken = await this.createSessionToken(user);
      return { user, sessionToken };
    }

    const refreshErr = await refreshResp.text();
    errors.push(`refresh: ${refreshResp.status} ${refreshErr}`);

    // All methods failed - return error detail
    console.error('Auth failed:', errors.join(' | '));
    return {
      user: null as unknown as User,
      sessionToken: '',
      error: errors.join(' | '),
    };
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
