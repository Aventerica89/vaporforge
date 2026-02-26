import type { Context, Next } from 'hono';

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** KV key prefix */
  prefix: string;
  /** Extract identifier from request (defaults to IP) */
  keyExtractor?: (c: Context) => string;
}

/**
 * KV-based sliding window rate limiter for Cloudflare Workers.
 *
 * Uses KV TTL for automatic expiry. Each key stores a counter that
 * resets when the TTL expires. Not perfectly atomic (KV is eventually
 * consistent), but sufficient for abuse prevention.
 */
export function rateLimit(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.AUTH_KV;
    const id = config.keyExtractor
      ? config.keyExtractor(c)
      : c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';

    const key = `rl:${config.prefix}:${id}`;

    const current = await kv.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= config.limit) {
      return c.json(
        { success: false, error: 'Too many requests' },
        429
      );
    }

    await kv.put(key, String(count + 1), {
      expirationTtl: config.windowSeconds,
    });

    await next();
  };
}

/** Rate limiter for auth endpoints: 10 req/min per IP */
export const authRateLimit = rateLimit({
  limit: 10,
  windowSeconds: 60,
  prefix: 'auth',
});

/** Rate limiter for AI generation endpoints: 30 req/min per user */
export const aiRateLimit = rateLimit({
  limit: 30,
  windowSeconds: 60,
  prefix: 'ai',
  keyExtractor: (c) => {
    const user = c.get('user') as { id: string } | undefined;
    return user?.id
      || c.req.header('cf-connecting-ip')
      || 'unknown';
  },
});
