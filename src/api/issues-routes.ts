import { Hono } from 'hono';
import { getIssues, saveIssues, deleteIssues } from './issues';
import type { User } from '../types';

type Variables = {
  user: User;
};

export const issuesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/issues - Get all issues for current user
issuesRoutes.get('/', getIssues);

// POST /api/issues - Save issues for current user
issuesRoutes.post('/', saveIssues);

// DELETE /api/issues - Delete all issues for current user
issuesRoutes.delete('/', deleteIssues);
