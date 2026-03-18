import type { Context } from 'hono';
import type { User } from '../types';

type Variables = {
  user: User;
};

type GHCtx = Context<{ Bindings: Env; Variables: Variables }>;

export interface GitHubRepoData {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  fork: boolean;
  private: boolean;
}

interface GitHubConnectionData {
  username: string;
  avatarUrl: string;
  connectedAt: string;
}

// KV key helpers
const ghTokenKey = (userId: string) => `github-token:${userId}`;
const ghConnectionKey = (userId: string) => `github-connection:${userId}`;
const ghRepoCacheKey = (userId: string) => `github-repos:${userId}`;
// Legacy key (read-only for migration)
const ghUsernameKey = (userId: string) => `github-username:${userId}`;

// ── OAuth flow ──────────────────────────────────────────────────────────

/** GET /api/github/auth — public version, authenticates via ?token= query param */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function githubAuthRedirectPublic(c: Context<any>) {
  const jwt = c.req.query('token');
  if (!jwt) return c.json({ error: 'Missing token parameter' }, 401);

  // Verify JWT manually (same as auth middleware but from query param)
  const { AuthService } = await import('../auth');
  const authService = new AuthService(c.env.AUTH_KV, c.env.JWT_SECRET);
  const user = await authService.getUserFromToken(jwt);
  if (!user) return c.json({ error: 'Invalid or expired token' }, 401);

  return githubAuthRedirectInternal(c, user);
}

/** GET /api/github/auth — authenticated version (used from routes with auth middleware) */
export async function githubAuthRedirect(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return githubAuthRedirectInternal(c, user);
}

async function githubAuthRedirectInternal(c: Context<any>, user: { id: string }) {

  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GitHub integration not configured' }, 503);
  }

  const baseUrl = c.env.WORKER_BASE_URL || 'https://vaporforge.dev';
  const redirectUri = `${baseUrl}/api/github/callback`;

  // State = userId encrypted so callback can associate the token
  // Use a simple signed token: userId:timestamp:hmac
  const state = await signState(user.id, c.env.JWT_SECRET);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

/** GET /api/github/callback — exchange code for token (public route, no JWT) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function githubCallback(c: Context<any>) {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return redirectWithError(c, 'missing_params');
  }

  // Verify state and extract userId
  const userId = await verifyState(state, c.env.JWT_SECRET);
  if (!userId) {
    return redirectWithError(c, 'state_expired');
  }

  const clientId = c.env.GITHUB_CLIENT_ID;
  const clientSecret = c.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(c, 'not_configured');
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    console.error(`[github] token exchange failed: ${tokenRes.status}`);
    return redirectWithError(c, 'exchange_failed');
  }

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token || tokenData.error) {
    console.error(`[github] token error: ${tokenData.error} — ${tokenData.error_description}`);
    return redirectWithError(c, tokenData.error ?? 'no_token');
  }

  // Fetch GitHub user profile
  const profileRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'VaporForge/1.0',
    },
  });

  let username = 'unknown';
  let avatarUrl = '';
  if (profileRes.ok) {
    const profile = await profileRes.json() as { login: string; avatar_url: string };
    username = profile.login;
    avatarUrl = profile.avatar_url;
  }

  // Store token and connection info in KV
  await c.env.AUTH_KV.put(ghTokenKey(userId), tokenData.access_token, {
    expirationTtl: 365 * 24 * 60 * 60, // GitHub tokens don't expire unless revoked
  });

  const connection: GitHubConnectionData = {
    username,
    avatarUrl,
    connectedAt: new Date().toISOString(),
  };
  await c.env.AUTH_KV.put(ghConnectionKey(userId), JSON.stringify(connection), {
    expirationTtl: 365 * 24 * 60 * 60,
  });

  // Also update legacy username key for backward compat
  await c.env.AUTH_KV.put(ghUsernameKey(userId), username);

  // Redirect back to home screen — repos will auto-load now that GitHub is connected
  const baseUrl = c.env.WORKER_BASE_URL || 'https://vaporforge.dev';
  return c.redirect(`${baseUrl}/app/?github_connected=1`);
}

// ── Connection management ───────────────────────────────────────────────

/** GET /api/github/connection — get current GitHub connection status */
export async function getGithubConnection(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const connection = await c.env.AUTH_KV.get<GitHubConnectionData>(
    ghConnectionKey(user.id),
    'json'
  );

  if (!connection) {
    // Check legacy username for migration
    const legacyUsername = await c.env.AUTH_KV.get(ghUsernameKey(user.id));
    return c.json({
      success: true,
      data: {
        connected: false,
        legacyUsername: legacyUsername || null,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      connected: true,
      username: connection.username,
      avatarUrl: connection.avatarUrl,
      connectedAt: connection.connectedAt,
    },
  });
}

/** DELETE /api/github/connection — disconnect GitHub */
export async function disconnectGithub(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  await c.env.AUTH_KV.delete(ghTokenKey(user.id));
  await c.env.AUTH_KV.delete(ghConnectionKey(user.id));
  await c.env.AUTH_KV.delete(ghRepoCacheKey(user.id));

  return c.json({ success: true });
}

// ── Repository listing ──────────────────────────────────────────────────

/** GET /api/github/repos — list repos using user's GitHub token */
export async function getGithubRepos(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const token = await c.env.AUTH_KV.get(ghTokenKey(user.id));
  if (!token) {
    return c.json({ error: 'GitHub not connected. Connect via Integrations.' }, 403);
  }

  // Check cache first
  const cached = await c.env.AUTH_KV.get<GitHubRepoData[]>(ghRepoCacheKey(user.id), 'json');
  if (cached) {
    return c.json({ success: true, data: { repos: cached, cached: true } });
  }

  return fetchAndCacheRepos(c, user.id, token);
}

/** POST /api/github/repos/sync — force refresh */
export async function syncGithubRepos(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const token = await c.env.AUTH_KV.get(ghTokenKey(user.id));
  if (!token) {
    return c.json({ error: 'GitHub not connected' }, 403);
  }

  return fetchAndCacheRepos(c, user.id, token);
}

/** GET /api/github/username — backward compat */
export async function getGithubUsername(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const connection = await c.env.AUTH_KV.get<GitHubConnectionData>(
    ghConnectionKey(user.id),
    'json'
  );
  if (connection) {
    return c.json({ success: true, data: { username: connection.username } });
  }

  // Fallback to legacy
  const username = await c.env.AUTH_KV.get(ghUsernameKey(user.id));
  return c.json({ success: true, data: { username: username || '' } });
}

/** PUT /api/github/username — save username (legacy compat) */
export async function saveGithubUsername(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ username: string }>();
  const username = sanitizeGitHubUsername(body.username || '');
  await c.env.AUTH_KV.put(ghUsernameKey(user.id), username);

  return c.json({ success: true });
}

/** GET /api/github/repos/:owner/:repo/branches — list branches for a repo */
export async function getGithubBranches(c: GHCtx) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  if (!owner || !repo) {
    return c.json({ error: 'Missing owner or repo parameter' }, 400);
  }

  const token = await c.env.AUTH_KV.get(ghTokenKey(user.id));
  if (!token) {
    return c.json({ error: 'GitHub not connected' }, 403);
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'VaporForge/1.0',
  };

  // Fetch branches and repo info in parallel
  const [branchesRes, repoRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&sort=updated`, { headers }),
    fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers }),
  ]);

  if (branchesRes.status === 401 || repoRes.status === 401) {
    return c.json({ error: 'GitHub token expired. Please reconnect.' }, 401);
  }

  if (branchesRes.status === 404 || repoRes.status === 404) {
    return c.json({ error: 'Repository not found or no access' }, 404);
  }

  if (!branchesRes.ok) {
    return c.json({ error: `Failed to fetch branches (${branchesRes.status})` }, 502);
  }

  const rawBranches = await branchesRes.json() as Array<{
    name: string;
    commit: { sha: string; url: string };
    protected: boolean;
  }>;

  let defaultBranch = 'main';
  if (repoRes.ok) {
    const repoData = await repoRes.json() as { default_branch: string };
    defaultBranch = repoData.default_branch;
  }

  const branches = rawBranches.map((b) => ({
    name: b.name,
    isDefault: b.name === defaultBranch,
    isProtected: b.protected,
  }));

  // Sort: default branch first, then alphabetical
  branches.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  return c.json({ success: true, data: { branches, defaultBranch } });
}

/** Get the raw GitHub token for container injection */
export async function getGithubToken(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(ghTokenKey(userId));
}

// ── Internal helpers ────────────────────────────────────────────────────

async function fetchAndCacheRepos(c: GHCtx, userId: string, token: string) {
  // Fetch authenticated user's repos (includes private repos the token has access to)
  const allRepos: GitHubRepoData[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= 5) { // Cap at 500 repos
    const url = `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VaporForge/1.0',
      },
    });

    if (res.status === 401) {
      // Token revoked — clean up connection
      await c.env.AUTH_KV.delete(ghTokenKey(userId));
      await c.env.AUTH_KV.delete(ghConnectionKey(userId));
      return c.json({ error: 'GitHub token expired. Please reconnect.' }, 401);
    }

    if (res.status === 403) {
      return c.json({ error: 'GitHub API rate limit reached' }, 429);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[github] repos fetch failed: status=${res.status} body=${body.slice(0, 200)}`);
      return c.json({ error: `Failed to fetch repositories (${res.status})` }, 502);
    }

    const repos: GitHubRepoData[] = await res.json();
    allRepos.push(...repos);

    if (repos.length < perPage) break;
    page++;
  }

  // Cache for 1 hour
  await c.env.AUTH_KV.put(ghRepoCacheKey(userId), JSON.stringify(allRepos), {
    expirationTtl: 3600,
  });

  return c.json({ success: true, data: { repos: allRepos, cached: false } });
}

function sanitizeGitHubUsername(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 39);
}

function redirectWithError(c: Context<any>, error: string) {
  const baseUrl = c.env.WORKER_BASE_URL || 'https://vaporforge.dev';
  return c.redirect(`${baseUrl}/app/#settings/integrations?github_error=${encodeURIComponent(error)}`);
}

// State signing: userId:timestamp — signed with HMAC to prevent tampering
async function signState(userId: string, secret: string): Promise<string> {
  const payload = `${userId}:${Date.now()}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // base64url encode the full state
  return btoa(`${payload}:${sigHex}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  try {
    // Decode base64url
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded);
    const parts = decoded.split(':');
    if (parts.length < 3) return null;

    const userId = parts[0];
    const timestamp = parseInt(parts[1], 10);
    const sigHex = parts.slice(2).join(':');

    // Check expiry (10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) return null;

    // Verify HMAC
    const payload = `${userId}:${timestamp}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = new Uint8Array(
      sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
    return valid ? userId : null;
  } catch {
    return null;
  }
}
