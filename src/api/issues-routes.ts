import { Hono } from 'hono';
import { getIssues, saveIssues, deleteIssues } from './issues';
import type { Env } from '../types';

export const issuesRoutes = new Hono<{ Bindings: Env }>();

// GET /api/issues - Get all issues for current user
issuesRoutes.get('/', getIssues);

// POST /api/issues - Save issues for current user
issuesRoutes.post('/', saveIssues);

// DELETE /api/issues - Delete all issues for current user
issuesRoutes.delete('/', deleteIssues);
