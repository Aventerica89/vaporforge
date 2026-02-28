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
  defaultModel: z.enum(['flash', 'pro', '3.1-pro']).default('flash'),
});

const EnableClaudeSchema = z.object({
  defaultModel: z.enum(['sonnet', 'haiku', 'opus']).default('sonnet'),
});

const EnableOpenAISchema = z.object({
  defaultModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini']).default('gpt-4o'),
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

// PUT /claude — enable Claude AI SDK
aiProvidersRoutes.put('/claude', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = EnableClaudeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const updated: AIProviderConfig = {
    ...config,
    claude: {
      enabled: true,
      defaultModel: parsed.data.defaultModel,
      addedAt: config.claude?.addedAt || new Date().toISOString(),
    },
  };

  await writeConfig(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: updated,
  });
});

// DELETE /claude — disable Claude AI SDK
aiProvidersRoutes.delete('/claude', async (c) => {
  const user = c.get('user');
  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const { claude: _, ...rest } = config;

  await writeConfig(c.env.SESSIONS_KV, user.id, rest);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: rest,
  });
});

// PUT /openai — enable OpenAI
aiProvidersRoutes.put('/openai', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = EnableOpenAISchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }, 400);
  }

  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const updated: AIProviderConfig = {
    ...config,
    openai: {
      enabled: true,
      defaultModel: parsed.data.defaultModel,
      addedAt: config.openai?.addedAt || new Date().toISOString(),
    },
  };

  await writeConfig(c.env.SESSIONS_KV, user.id, updated);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: updated,
  });
});

// DELETE /openai — disable OpenAI
aiProvidersRoutes.delete('/openai', async (c) => {
  const user = c.get('user');
  const config = await readConfig(c.env.SESSIONS_KV, user.id);
  const { openai: _, ...rest } = config;

  await writeConfig(c.env.SESSIONS_KV, user.id, rest);

  return c.json<ApiResponse<AIProviderConfig>>({
    success: true,
    data: rest,
  });
});

/**
 * Collect Claude AI SDK config for Quick Chat / Code Transform availability.
 * Returns true if Claude AI SDK provider is enabled AND API key exists.
 */
export async function isClaudeAiSdkAvailable(
  kv: KVNamespace,
  userId: string
): Promise<boolean> {
  const config = await readConfig(kv, userId);
  if (!config.claude?.enabled) return false;

  const secretsRaw = await kv.get(`user-secrets:${userId}`);
  if (!secretsRaw) return false;

  try {
    const secrets = JSON.parse(secretsRaw);
    return !!secrets.ANTHROPIC_API_KEY;
  } catch {
    return false;
  }
}

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
