import { Hono } from 'hono';
import { getFavorites, saveFavorites } from './favorites';
import type { User } from '../types';

type Variables = {
  user: User;
};

export const favoritesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/favorites - Get favorites for current user
favoritesRoutes.get('/', getFavorites);

// PUT /api/favorites - Save favorites for current user
favoritesRoutes.put('/', saveFavorites);
