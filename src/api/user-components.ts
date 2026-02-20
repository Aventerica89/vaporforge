import { Hono } from 'hono';
import type { User, ApiResponse } from '../types';

export interface UserComponentFile {
  path: string;
  content: string;
}

export interface UserComponentEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  code: string;
  dependencies: string[];
  tailwindClasses: string[];
  type?: 'snippet' | 'app';
  files?: UserComponentFile[];
  isCustom: true;
  createdAt: string;
}

type Variables = { user: User };

export const userComponentsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_COMPONENTS = 200;
const MAX_NAME_LENGTH = 80;
const KV_KEY = (userId: string) => `user-components:${userId}`;

async function getComponents(kv: KVNamespace, userId: string): Promise<UserComponentEntry[]> {
  const raw = await kv.get(KV_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UserComponentEntry[];
  } catch {
    return [];
  }
}

// GET /api/user-components
userComponentsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const components = await getComponents(c.env.SESSIONS_KV, user.id);
  return c.json<ApiResponse<UserComponentEntry[]>>({ success: true, data: components });
});

// POST /api/user-components
userComponentsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Omit<UserComponentEntry, 'id' | 'isCustom' | 'createdAt'>>();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Name is required' }, 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return c.json<ApiResponse<never>>(
      { success: false, error: `Name too long (max ${MAX_NAME_LENGTH} chars)` },
      400
    );
  }

  const type = body.type ?? 'snippet';
  if (type === 'snippet' && !body.code?.trim()) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Code is required for snippet type' }, 400);
  }
  if (type === 'app' && (!body.files || body.files.length === 0)) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Files are required for app type' }, 400);
  }

  const existing = await getComponents(c.env.SESSIONS_KV, user.id);
  if (existing.length >= MAX_COMPONENTS) {
    return c.json<ApiResponse<never>>(
      { success: false, error: `Maximum of ${MAX_COMPONENTS} components reached` },
      400
    );
  }

  const entry: UserComponentEntry = {
    id: crypto.randomUUID(),
    name,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'Custom',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    code: body.code ?? '',
    dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
    tailwindClasses: Array.isArray(body.tailwindClasses) ? body.tailwindClasses : [],
    type,
    ...(type === 'app' && body.files ? { files: body.files } : {}),
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  const updated = [entry, ...existing];
  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(updated));

  return c.json<ApiResponse<UserComponentEntry>>({ success: true, data: entry });
});

// DELETE /api/user-components/:id
userComponentsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await getComponents(c.env.SESSIONS_KV, user.id);
  const updated = existing.filter((e) => e.id !== id);
  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(updated));

  return c.json<ApiResponse<{ id: string }>>({ success: true, data: { id } });
});
