import type { User, AuthTokenPayloadType } from './types';

const CLAUDE_OAUTH_URL = 'https://claude.ai/oauth';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Simple JWT-like token creation (for demo - use proper JWT in production)
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
    private jwtSecret: string,
    private clientId?: string,
    private clientSecret?: string
  ) {}

  // Generate OAuth URL for Claude login
  getOAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'claude-code',
      state,
    });
    return `${CLAUDE_OAUTH_URL}/authorize?${params}`;
  }

  // Exchange OAuth code for tokens
  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken?: string } | null> {
    // If Claude OAuth is not available, fall back to API key auth
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    try {
      const response = await fetch(`${CLAUDE_OAUTH_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    } catch {
      return null;
    }
  }

  // Create or get user from Claude token
  async getOrCreateUser(claudeToken: string): Promise<User | null> {
    // In production, validate token with Claude API and get user info
    // For now, create a user based on token hash
    const tokenHash = await this.hashToken(claudeToken);
    const userId = `user_${tokenHash.slice(0, 16)}`;

    const existingUser = await this.kv.get<User>(`user:${userId}`, 'json');
    if (existingUser) {
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

  // API Key authentication (fallback when OAuth not available)
  async authenticateWithApiKey(apiKey: string): Promise<User | null> {
    // Validate API key format
    if (!apiKey.startsWith('sk-ant-')) {
      return null;
    }

    // Create/get user for this API key
    return this.getOrCreateUser(apiKey);
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

      // Try as session token first
      const user = await authService.getUserFromToken(token);
      if (user) return user;

      // Try as API key
      return authService.authenticateWithApiKey(token);
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
