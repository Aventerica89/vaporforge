import type { Context } from 'hono';
import type { User } from '../types';

type Variables = {
  user: User;
};

export interface Issue {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'error' | 'feature' | 'suggestion';
  size: 'S' | 'M' | 'L';
  screenshots: Array<{ id: string; dataUrl: string }>;
  claudeNote?: string;
  resolved: boolean;
  createdAt: string;
}

export interface IssueTrackerData {
  issues: Issue[];
  suggestions: string;
  filter: string;
  updatedAt?: string;
}

// Get issues for current user
export async function getIssues(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const key = `issues:${userId}`;
  const data = await c.env.AUTH_KV.get<IssueTrackerData>(key, 'json');

  return c.json({ success: true, data: data || { issues: [], suggestions: '', filter: 'all' } });
}

// Save issues for current user
export async function saveIssues(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const data = await c.req.json<IssueTrackerData>();
  const key = `issues:${userId}`;

  // Stamp updatedAt so other tabs can detect changes
  data.updatedAt = new Date().toISOString();
  await c.env.AUTH_KV.put(key, JSON.stringify(data));

  return c.json({ success: true, data: { updatedAt: data.updatedAt } });
}

// Sync endpoint — returns issues + updatedAt; supports ETag / If-None-Match
export async function syncIssues(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const key = `issues:${userId}`;
  const raw = await c.env.AUTH_KV.get(key, 'text');

  if (!raw) {
    return c.json({
      success: true,
      data: { issues: [], suggestions: '', filter: 'all', updatedAt: null },
    });
  }

  // Use updatedAt as ETag for conditional requests
  const data = JSON.parse(raw) as IssueTrackerData;
  const etag = `"${data.updatedAt || 'none'}"`;
  const ifNoneMatch = c.req.header('If-None-Match');

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304 });
  }

  return c.json(
    { success: true, data },
    200,
    { ETag: etag }
  );
}

// Patch a single issue by id
export async function patchIssue(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;
  const issueId = c.req.param('id');

  const key = `issues:${userId}`;
  const raw = await c.env.AUTH_KV.get(key, 'text');
  if (!raw) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = JSON.parse(raw) as IssueTrackerData;
  const idx = data.issues.findIndex((i) => i.id === issueId);
  if (idx === -1) {
    return c.json({ error: 'Issue not found' }, 404);
  }

  const updates = await c.req.json<Partial<Issue>>();
  data.issues[idx] = { ...data.issues[idx], ...updates, id: issueId };
  data.updatedAt = new Date().toISOString();

  await c.env.AUTH_KV.put(key, JSON.stringify(data));

  return c.json({ success: true, data: { issue: data.issues[idx], updatedAt: data.updatedAt } });
}

// Delete all issues for current user
export async function deleteIssues(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const key = `issues:${userId}`;
  await c.env.AUTH_KV.delete(key);

  return c.json({ success: true });
}
