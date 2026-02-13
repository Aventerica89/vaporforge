import { Hono } from 'hono';
import type { User, ApiResponse, ConfigFile, ConfigCategory } from '../types';
import { ConfigFileSchema, CONFIG_CATEGORIES } from '../types';

type Variables = {
  user: User;
};

export const configRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max config files per category per user */
const MAX_FILES_PER_CATEGORY = 30;

/** KV key for a user's config files in a given category */
function kvKey(userId: string, category: ConfigCategory): string {
  return `user-config:${userId}:${category}`;
}

/** Read config files from KV for a category */
async function readConfigFiles(
  kv: KVNamespace,
  userId: string,
  category: ConfigCategory
): Promise<ConfigFile[]> {
  const raw = await kv.get(kvKey(userId, category));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Write config files to KV for a category */
async function writeConfigFiles(
  kv: KVNamespace,
  userId: string,
  category: ConfigCategory,
  files: ConfigFile[]
): Promise<void> {
  await kv.put(kvKey(userId, category), JSON.stringify(files));
}

/** Validate category parameter */
function parseCategory(raw: string): ConfigCategory | null {
  return CONFIG_CATEGORIES.includes(raw as ConfigCategory)
    ? (raw as ConfigCategory)
    : null;
}

// GET /:category — list all config files for a category
configRoutes.get('/:category', async (c) => {
  const user = c.get('user');
  const category = parseCategory(c.req.param('category'));

  if (!category) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid category. Must be one of: rules, commands, agents',
    }, 400);
  }

  const files = await readConfigFiles(c.env.SESSIONS_KV, user.id, category);

  return c.json<ApiResponse<ConfigFile[]>>({
    success: true,
    data: files,
  });
});

// POST /:category — add a new config file
configRoutes.post('/:category', async (c) => {
  const user = c.get('user');
  const category = parseCategory(c.req.param('category'));

  if (!category) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid category. Must be one of: rules, commands, agents',
    }, 400);
  }

  const body = await c.req.json();
  const now = new Date().toISOString();

  const parsed = ConfigFileSchema.safeParse({
    ...body,
    createdAt: now,
    updatedAt: now,
  });

  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid config file data',
    }, 400);
  }

  const file = parsed.data;
  const existing = await readConfigFiles(c.env.SESSIONS_KV, user.id, category);

  // Check for duplicate filename
  if (existing.some((f) => f.filename === file.filename)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `File "${file.filename}" already exists in ${category}`,
    }, 409);
  }

  if (existing.length >= MAX_FILES_PER_CATEGORY) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Maximum of ${MAX_FILES_PER_CATEGORY} files per category`,
    }, 400);
  }

  const updated = [...existing, file];
  await writeConfigFiles(c.env.SESSIONS_KV, user.id, category, updated);

  return c.json<ApiResponse<ConfigFile>>({
    success: true,
    data: file,
  });
});

// PUT /:category/:filename — update content or toggle enabled
configRoutes.put('/:category/:filename', async (c) => {
  const user = c.get('user');
  const category = parseCategory(c.req.param('category'));
  const filename = decodeURIComponent(c.req.param('filename'));

  if (!category) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid category. Must be one of: rules, commands, agents',
    }, 400);
  }

  const body = await c.req.json() as {
    content?: string;
    enabled?: boolean;
  };

  const existing = await readConfigFiles(c.env.SESSIONS_KV, user.id, category);
  const idx = existing.findIndex((f) => f.filename === filename);

  if (idx === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `File "${filename}" not found in ${category}`,
    }, 404);
  }

  const now = new Date().toISOString();
  const updated = existing.map((f, i) => {
    if (i !== idx) return f;
    return {
      ...f,
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      updatedAt: now,
    };
  });

  // Validate content length if provided
  if (body.content !== undefined && body.content.length > 50_000) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Content exceeds 50KB limit',
    }, 400);
  }

  await writeConfigFiles(c.env.SESSIONS_KV, user.id, category, updated);

  return c.json<ApiResponse<ConfigFile>>({
    success: true,
    data: updated[idx],
  });
});

// DELETE /:category/:filename — remove a config file
configRoutes.delete('/:category/:filename', async (c) => {
  const user = c.get('user');
  const category = parseCategory(c.req.param('category'));
  const filename = decodeURIComponent(c.req.param('filename'));

  if (!category) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Invalid category. Must be one of: rules, commands, agents',
    }, 400);
  }

  const existing = await readConfigFiles(c.env.SESSIONS_KV, user.id, category);
  const idx = existing.findIndex((f) => f.filename === filename);

  if (idx === -1) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `File "${filename}" not found in ${category}`,
    }, 404);
  }

  const updated = existing.filter((_, i) => i !== idx);
  await writeConfigFiles(c.env.SESSIONS_KV, user.id, category, updated);

  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});

/**
 * Collect all enabled user config files for sandbox injection.
 * Called at session creation alongside collectPluginConfigs().
 */
export async function collectUserConfigs(
  kv: KVNamespace,
  userId: string
): Promise<{
  rules: Array<{ filename: string; content: string }>;
  commands: Array<{ filename: string; content: string }>;
  agents: Array<{ filename: string; content: string }>;
}> {
  const [rules, commands, agents] = await Promise.all([
    readConfigFiles(kv, userId, 'rules'),
    readConfigFiles(kv, userId, 'commands'),
    readConfigFiles(kv, userId, 'agents'),
  ]);

  return {
    rules: rules
      .filter((f) => f.enabled)
      .map((f) => ({ filename: f.filename, content: f.content })),
    commands: commands
      .filter((f) => f.enabled)
      .map((f) => ({ filename: f.filename, content: f.content })),
    agents: agents
      .filter((f) => f.enabled)
      .map((f) => ({ filename: f.filename, content: f.content })),
  };
}
