import { Hono } from 'hono';
import {
  getGithubRepos,
  syncGithubRepos,
  getGithubBranches,
  getGithubUsername,
  saveGithubUsername,
  getGithubConnection,
  disconnectGithub,
  githubAuthRedirect,
} from './github';
import type { User } from '../types';

type Variables = {
  user: User;
};

export const githubRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── OAuth flow (authenticated — user must be logged in to initiate) ─────
// GET /api/github/auth — redirect to GitHub OAuth
githubRoutes.get('/auth', githubAuthRedirect);

// ── Connection management ───────────────────────────────────────────────
// GET /api/github/connection — check if GitHub is connected
githubRoutes.get('/connection', getGithubConnection);

// DELETE /api/github/connection — disconnect GitHub
githubRoutes.delete('/connection', disconnectGithub);

// ── Repos ───────────────────────────────────────────────────────────────
// GET /api/github/repos — list repos (uses OAuth token)
githubRoutes.get('/repos', getGithubRepos);

// POST /api/github/repos/sync — force refresh
githubRoutes.post('/repos/sync', syncGithubRepos);

// GET /api/github/repos/:owner/:repo/branches — list branches
githubRoutes.get('/repos/:owner/:repo/branches', getGithubBranches);

// ── Legacy (backward compat) ────────────────────────────────────────────
// GET /api/github/username
githubRoutes.get('/username', getGithubUsername);

// PUT /api/github/username
githubRoutes.put('/username', saveGithubUsername);
