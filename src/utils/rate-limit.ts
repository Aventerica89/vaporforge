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
 * KV-based rate limiter for Cloudflare Workers.
 *
 * IMPORTANT: KV is eventually consistent — concurrent requests from the same
 * IP can bypass this limiter via race conditions. This is a best-effort abuse
 * prevention layer only. For hard enforcement, configure a Cloudflare rate
 * limit rule at the edge (Security > WAF > Rate limiting rules in the dashboard).
 *
 * TODO(#135): Configure CF WAF rate-limit rule in the dashboard to close the
 * race window. KV read-then-write is inherently non-atomic; a WAF rule at the
 * edge enforces limits before requests reach the Worker.
 *
 * Uses KV TTL for automatic expiry. Each key stores a counter that resets
 * when the TTL expires.
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
