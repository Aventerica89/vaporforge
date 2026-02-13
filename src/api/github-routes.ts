import { Hono } from 'hono';
import {
  getGithubRepos,
  syncGithubRepos,
  getGithubUsername,
  saveGithubUsername,
} from './github';
import type { User } from '../types';

type Variables = {
  user: User;
};

export const githubRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/github/repos?username=... - Get repos (cached)
githubRoutes.get('/repos', getGithubRepos);

// POST /api/github/repos/sync - Force refresh repos
githubRoutes.post('/repos/sync', syncGithubRepos);

// GET /api/github/username - Get saved username
githubRoutes.get('/username', getGithubUsername);

// PUT /api/github/username - Save default username
githubRoutes.put('/username', saveGithubUsername);
