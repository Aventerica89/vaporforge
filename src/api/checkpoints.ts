import { Hono } from 'hono';
import type { User, ApiResponse } from '../types';

export interface Checkpoint {
  id: string;
  name: string;
  sessionId: string;
  timestamp: string;
  summary: string;
}

type Variables = { user: User };

export const checkpointsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_CHECKPOINTS = 20;
const MAX_NAME_LENGTH = 80;
const KV_KEY = (userId: string) => `session-checkpoints:${userId}`;

async function getCheckpoints(kv: KVNamespace, userId: string): Promise<Checkpoint[]> {
  const raw = await kv.get(KV_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Checkpoint[];
  } catch {
    return [];
  }
}

// GET /api/checkpoints — return last 10, newest first
checkpointsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const all = await getCheckpoints(c.env.SESSIONS_KV, user.id);
  const recent = [...all].reverse().slice(0, 10);
  return c.json<ApiResponse<Checkpoint[]>>({ success: true, data: recent });
});

// POST /api/checkpoints — save a new checkpoint
checkpointsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name: string; sessionId: string; summary?: string }>();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'name must be 1–80 characters' },
      400,
    );
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return c.json<ApiResponse<never>>(
      { success: false, error: 'sessionId is required' },
      400,
    );
  }

  const checkpoint: Checkpoint = {
    id: crypto.randomUUID(),
    name,
    sessionId,
    timestamp: new Date().toISOString(),
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
  };

  const existing = await getCheckpoints(c.env.SESSIONS_KV, user.id);
  const updated = [...existing, checkpoint];

  // Trim to MAX_CHECKPOINTS by dropping oldest entries
  const trimmed = updated.length > MAX_CHECKPOINTS
    ? updated.slice(updated.length - MAX_CHECKPOINTS)
    : updated;

  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(trimmed));
  return c.json<ApiResponse<Checkpoint>>({ success: true, data: checkpoint });
});

// DELETE /api/checkpoints/:id — remove a checkpoint
checkpointsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await getCheckpoints(c.env.SESSIONS_KV, user.id);
  const filtered = existing.filter((cp) => cp.id !== id);

  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(filtered));
  return c.json<ApiResponse<{ id: string }>>({ success: true, data: { id } });
});
