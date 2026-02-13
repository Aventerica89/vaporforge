import { Hono } from 'hono';
import { z } from 'zod';
import type { User, ApiResponse } from '../types';

type Variables = {
  user: User;
};

export const secretsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max secrets per user */
const MAX_SECRETS = 50;

/** Max value size (10KB) */
const MAX_VALUE_SIZE = 10_000;

/** Names that cannot be overridden by user secrets */
const RESERVED_NAMES = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NODE_PATH',
  'IS_SANDBOX',
  'PATH',
  'HOME',
  'USER',
  'SHELL',
]);

const SecretNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid env var name');

const AddSecretSchema = z.object({
  name: SecretNameSchema,
  value: z.string().min(1).max(MAX_VALUE_SIZE),
});

/** KV key for a user's secrets map */
function kvKey(userId: string): string {
  return `user-secrets:${userId}`;
}

/** Generate a masked hint from a secret value */
function makeHint(value: string): string {
  return value.length >= 5 ? '...' + value.slice(-4) : '****';
}

/** Read secrets map from KV (returns empty object on missing/invalid) */
async function readSecrets(
  kv: KVNamespace,
  userId: string
): Promise<Record<string, string>> {
  const raw = await kv.get(kvKey(userId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Filter to string-only values
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        result[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Write secrets map to KV */
async function writeSecrets(
  kv: KVNamespace,
  userId: string,
  secrets: Record<string, string>
): Promise<void> {
  await kv.put(kvKey(userId), JSON.stringify(secrets));
}

// GET / — list secrets (name + hint only, never full values)
secretsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const secrets = await readSecrets(c.env.SESSIONS_KV, user.id);

  const list = Object.entries(secrets).map(([name, value]) => ({
    name,
    hint: makeHint(value),
  }));

  return c.json<ApiResponse<Array<{ name: string; hint: string }>>>({
    success: true,
    data: list,
  });
});

// POST / — add or update a secret
secretsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = AddSecretSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const { name, value } = parsed.data;

  if (RESERVED_NAMES.has(name)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `"${name}" is a reserved name and cannot be used`,
    }, 400);
  }

  const secrets = await readSecrets(c.env.SESSIONS_KV, user.id);

  // Check limit (only if adding a new key, not updating existing)
  if (!(name in secrets) && Object.keys(secrets).length >= MAX_SECRETS) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Maximum of ${MAX_SECRETS} secrets reached`,
    }, 400);
  }

  const updated = { ...secrets, [name]: value };
  await writeSecrets(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<{ name: string; hint: string }>>({
    success: true,
    data: { name, hint: makeHint(value) },
  });
});

// DELETE /:name — remove a secret
secretsRoutes.delete('/:name', async (c) => {
  const user = c.get('user');
  const name = c.req.param('name');

  const secrets = await readSecrets(c.env.SESSIONS_KV, user.id);

  if (!(name in secrets)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Secret not found',
    }, 404);
  }

  const { [name]: _, ...remaining } = secrets;
  await writeSecrets(c.env.SESSIONS_KV, user.id, remaining);

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});
