import { Hono } from 'hono';
import type { User } from '../types';
import type { ApiResponse } from '../types';

type Variables = {
  user: User;
};

export const userRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max size for user CLAUDE.md content (50KB — generous but bounded) */
const MAX_CLAUDE_MD_SIZE = 50_000;

// Get user's CLAUDE.md
userRoutes.get('/claude-md', async (c) => {
  const user = c.get('user');

  const content = await c.env.SESSIONS_KV.get(
    `user-config:${user.id}:claude-md`
  );

  return c.json<ApiResponse<{ content: string }>>({
    success: true,
    data: { content: content || '' },
  });
});

// Save user's CLAUDE.md
userRoutes.put('/claude-md', async (c) => {
  const user = c.get('user');

  const body = await c.req.json<{ content: string }>();

  if (typeof body.content !== 'string') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Content must be a string',
    }, 400);
  }

  if (body.content.length > MAX_CLAUDE_MD_SIZE) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Content exceeds maximum size (${MAX_CLAUDE_MD_SIZE} chars)`,
    }, 400);
  }

  await c.env.SESSIONS_KV.put(
    `user-config:${user.id}:claude-md`,
    body.content
  );

  return c.json<ApiResponse<{ saved: boolean }>>({
    success: true,
    data: { saved: true },
  });
});
