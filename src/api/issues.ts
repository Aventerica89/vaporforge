import type { Context } from 'hono';
import type { Env } from '../types';

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
}

// Get issues for current user
export async function getIssues(c: Context<{ Bindings: Env }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const key = `issues:${userId}`;
  const data = await c.env.AUTH_KV.get<IssueTrackerData>(key, 'json');

  return c.json(data || { issues: [], suggestions: '', filter: 'all' });
}

// Save issues for current user
export async function saveIssues(c: Context<{ Bindings: Env }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const data = await c.req.json<IssueTrackerData>();
  const key = `issues:${userId}`;

  await c.env.AUTH_KV.put(key, JSON.stringify(data));

  return c.json({ success: true });
}

// Delete all issues for current user
export async function deleteIssues(c: Context<{ Bindings: Env }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const key = `issues:${userId}`;
  await c.env.AUTH_KV.delete(key);

  return c.json({ success: true });
}
