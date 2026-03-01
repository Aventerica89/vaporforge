import type { Context } from 'hono';
import type { User } from '../types';

type Variables = {
  user: User;
};

export interface GitHubRepoData {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  fork: boolean;
}

// Get GitHub repos (cached via KV)
export async function getGithubRepos(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const username = c.req.query('username');
  if (!username) {
    return c.json({ error: 'username query param required' }, 400);
  }

  const cacheKey = `github-repos:${user.id}:${username}`;
  const cached = await c.env.AUTH_KV.get<GitHubRepoData[]>(cacheKey, 'json');

  if (cached) {
    return c.json({ success: true, data: { repos: cached, cached: true } });
  }

  return fetchAndCacheRepos(c, user.id, username);
}

// Force-refresh GitHub repos (bypass cache)
export async function syncGithubRepos(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ username: string }>();
  const username = body.username?.trim();
  if (!username) {
    return c.json({ error: 'username required' }, 400);
  }

  return fetchAndCacheRepos(c, user.id, username);
}

// Get saved GitHub username
export async function getGithubUsername(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const key = `github-username:${user.id}`;
  const username = await c.env.AUTH_KV.get(key);

  return c.json({ success: true, data: { username: username || '' } });
}

// Save default GitHub username
export async function saveGithubUsername(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ username: string }>();
  const key = `github-username:${user.id}`;

  await c.env.AUTH_KV.put(key, body.username || '');

  return c.json({ success: true });
}

// Internal: fetch repos from GitHub API and cache in KV
async function fetchAndCacheRepos(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  userId: string,
  username: string
) {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'VaporForge/1.0',
      ...(c.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${c.env.GITHUB_TOKEN}` } : {}),
    },
  });

  if (res.status === 404) {
    return c.json({ error: `User "${username}" not found` }, 404);
  }
  if (res.status === 403) {
    return c.json({ error: 'GitHub API rate limit reached' }, 429);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[github] repos fetch failed: status=${res.status} body=${body.slice(0, 200)} hasToken=${!!c.env.GITHUB_TOKEN}`);
    return c.json({ error: `Failed to fetch repositories from GitHub (${res.status})` }, 502);
  }

  const repos: GitHubRepoData[] = await res.json();

  // Cache for 1 hour
  const cacheKey = `github-repos:${userId}:${username}`;
  await c.env.AUTH_KV.put(cacheKey, JSON.stringify(repos), {
    expirationTtl: 3600,
  });

  return c.json({ success: true, data: { repos, cached: false } });
}
