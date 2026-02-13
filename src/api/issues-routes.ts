import { Hono } from 'hono';
import { getIssues, saveIssues, deleteIssues, syncIssues, patchIssue } from './issues';
import type { User } from '../types';

type Variables = {
  user: User;
};

export const issuesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/issues - Get all issues for current user
issuesRoutes.get('/', getIssues);

// GET /api/issues/sync - Sync endpoint with ETag support
issuesRoutes.get('/sync', syncIssues);

// POST /api/issues - Save issues for current user
issuesRoutes.post('/', saveIssues);

// PATCH /api/issues/:id - Patch a single issue
issuesRoutes.patch('/:id', patchIssue);

// DELETE /api/issues - Delete all issues for current user
issuesRoutes.delete('/', deleteIssues);
