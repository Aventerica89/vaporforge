import { z } from 'zod';
import type { Context } from 'hono';
import type { User } from '../types';

type Variables = {
  user: User;
};

// --- Zod schemas for input validation ---

const ScreenshotSchema = z.object({
  id: z.string().max(100),
  dataUrl: z.string().max(500_000), // ~375KB base64 image max
});

const IssueSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  type: z.enum(['bug', 'error', 'feature', 'suggestion']),
  size: z.enum(['S', 'M', 'L']),
  screenshots: z.array(ScreenshotSchema).max(10).default([]),
  claudeNote: z.string().max(2000).optional(),
  resolved: z.boolean(),
  createdAt: z.string().max(50),
});

const SaveIssuesSchema = z.object({
  issues: z.array(IssueSchema).max(200),
  suggestions: z.string().max(10000),
  filter: z.string().max(50),
});

const PatchIssueSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  type: z.enum(['bug', 'error', 'feature', 'suggestion']).optional(),
  size: z.enum(['S', 'M', 'L']).optional(),
  screenshots: z.array(ScreenshotSchema).max(10).optional(),
  claudeNote: z.string().max(2000).optional(),
  resolved: z.boolean().optional(),
}).strict();

// --- Inferred types ---

export type Issue = z.infer<typeof IssueSchema>;

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

  const body = await c.req.json();
  const parsed = SaveIssuesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid data', details: parsed.error.issues }, 400);
  }

  const key = `issues:${userId}`;
  const data: IssueTrackerData = {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };

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

  const body = await c.req.json();
  const parsed = PatchIssueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid patch data', details: parsed.error.issues }, 400);
  }

  const updatedIssue: Issue = { ...data.issues[idx], ...parsed.data, id: issueId };
  const updatedIssues = data.issues.map((issue, i) => (i === idx ? updatedIssue : issue));
  const updatedData: IssueTrackerData = {
    ...data,
    issues: updatedIssues,
    updatedAt: new Date().toISOString(),
  };

  await c.env.AUTH_KV.put(key, JSON.stringify(updatedData));

  return c.json({ success: true, data: { issue: updatedIssue, updatedAt: updatedData.updatedAt } });
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
