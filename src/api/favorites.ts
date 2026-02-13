import type { Context } from 'hono';
import type { User } from '../types';

type Variables = {
  user: User;
};

export interface FavoriteRepo {
  url: string;
  name: string;
  owner: string;
  description?: string;
}

// Get favorites for current user
export async function getFavorites(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const key = `favorites:${user.id}`;
  const data = await c.env.AUTH_KV.get<FavoriteRepo[]>(key, 'json');

  return c.json({ success: true, data: { favorites: data || [] } });
}

// Save favorites for current user
export async function saveFavorites(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ favorites: FavoriteRepo[] }>();
  const key = `favorites:${user.id}`;

  await c.env.AUTH_KV.put(key, JSON.stringify(body.favorites || []));

  return c.json({ success: true });
}
