import { Hono } from 'hono';
import { z } from 'zod';
import type { User, ApiResponse, AIProviderConfig } from '../types';

type Variables = {
  user: User;
};

export const aiProvidersRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** KV key for a user's AI provider config */
function kvKey(userId: string): string {
  return `user-ai-providers:${userId}`;
}

/** Read provider config from KV */
async function readConfig(
  kv: KVNamespace,
  userId: string
): Promise<AIProviderConfig> {
  const raw = await kv.get(kvKey(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write provider config to KV */
async function writeConfig(
  kv: KVNamespace,
  userId: string,
  config: AIProviderConfig
): Promise<void> {
  await kv.put(kvKey(userId), JSON.stringify(config));
}

const EnableGeminiSchema = z.object({
  defaultModel: z.enum(['flash', 'pro']).default('flash'),
});

// GET / — get all provider configs
aiProvidersRoutes.get('/', async (c) => {
  const user = c.get('user');
  const config = await readConfig(c.env.SESSIONS_KV, user.id);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: config,
  });
});

// PUT /gemini — enable Gemini
aiProvidersRoutes.put('/gemini', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = EnableGeminiSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const updated: AIProviderConfig = {
    ...config,
    gemini: {
      enabled: true,
      defaultModel: parsed.data.defaultModel,
      addedAt: config.gemini?.addedAt || new Date().toISOString(),
    },
  };

  await writeConfig(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: updated,
  });
});

// DELETE /gemini — disable Gemini
aiProvidersRoutes.delete('/gemini', async (c) => {
  const user = c.get('user');
  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const { gemini: _, ...rest } = config;

  await writeConfig(c.env.SESSIONS_KV, user.id, rest);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: rest,
  });
});

/**
 * Collect Gemini MCP config for sandbox injection.
 * Returns MCP server config object if Gemini is enabled AND API key exists, else null.
 */
export async function collectGeminiMcpConfig(
  kv: KVNamespace,
  userId: string
): Promise<Record<string, Record<string, unknown>> | null> {
  const config = await readConfig(kv, userId);
  if (!config.gemini?.enabled) return null;

  // Check if GEMINI_API_KEY exists in user secrets
  const secretsRaw = await kv.get(`user-secrets:${userId}`);
  if (!secretsRaw) return null;

  try {
    const secrets = JSON.parse(secretsRaw);
    if (!secrets.GEMINI_API_KEY) return null;
  } catch {
    return null;
  }

  return {
    gemini: {
      command: 'node',
      args: ['/opt/claude-agent/gemini-mcp-server.js'],
    },
  };
}
