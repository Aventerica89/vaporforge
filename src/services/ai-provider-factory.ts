import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/** Supported provider names */
export type ProviderName = 'claude' | 'gemini';

/** Short model aliases mapped to full model IDs */
const MODEL_MAP: Record<ProviderName, Record<string, string>> = {
  claude: {
    sonnet: 'claude-sonnet-4-5-20250929',
    haiku: 'claude-haiku-4-5-20251001',
    opus: 'claude-opus-4-6',
  },
  gemini: {
    flash: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
  },
};

/** Default model per provider */
const DEFAULT_MODEL: Record<ProviderName, string> = {
  claude: 'sonnet',
  gemini: 'flash',
};

export interface ProviderCredentials {
  claude?: { apiKey: string };
  gemini?: { apiKey: string };
}

/**
 * Resolve a short model alias (e.g. 'sonnet') to a full model ID.
 * Returns the alias unchanged if no mapping exists.
 */
export function resolveModelId(
  provider: ProviderName,
  shortName?: string
): string {
  const alias = shortName || DEFAULT_MODEL[provider];
  return MODEL_MAP[provider][alias] || alias;
}

/**
 * Create an AI SDK LanguageModelV1 instance for the given provider + model.
 * Throws if credentials are missing.
 *
 * IMPORTANT: Only works with actual API keys (sk-ant-api01-*), NOT OAuth
 * tokens (sk-ant-oat01-*). The Anthropic API rejects OAuth auth for direct
 * API calls. OAuth tokens only work through the Claude SDK in containers.
 */
export function createModel(
  provider: ProviderName,
  credentials: ProviderCredentials,
  modelAlias?: string
): LanguageModel {
  const modelId = resolveModelId(provider, modelAlias);

  if (provider === 'claude') {
    const key = credentials.claude?.apiKey;
    if (!key) {
      throw new Error(
        'Claude API key required. Add an API key (sk-ant-api01-*) in Settings > AI Providers.'
      );
    }

    const anthropic = createAnthropic({ apiKey: key });
    return anthropic(modelId);
  }

  if (provider === 'gemini') {
    const key = credentials.gemini?.apiKey;
    if (!key) throw new Error('Gemini API key not configured');
    const google = createGoogleGenerativeAI({ apiKey: key });
    return google(modelId);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Read provider credentials from KV for direct API features
 * (Quick Chat, Code Transform, Analyze, Commit Message).
 *
 * Only returns credentials that work for direct API calls:
 * - Claude: requires sk-ant-api01-* key stored in user secrets
 *   (OAuth tokens sk-ant-oat01-* are NOT supported by the Anthropic API)
 * - Gemini: requires API key stored in user secrets
 *
 * The user's OAuth session token (claudeToken) is intentionally NOT used
 * here — it only works through the Claude SDK in sandbox containers.
 */
export async function getProviderCredentials(
  kv: KVNamespace,
  userId: string,
  _claudeToken?: string
): Promise<ProviderCredentials> {
  const raw = await kv.get(`user-secrets:${userId}`);
  const secrets: Record<string, string> = raw
    ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
    : {};

  // Only use explicit API keys — never OAuth tokens
  const claudeApiKey = secrets.ANTHROPIC_API_KEY;
  let claude: { apiKey: string } | undefined;

  if (claudeApiKey) {
    // Reject OAuth tokens stored as API keys (user mistake)
    if (claudeApiKey.startsWith('sk-ant-oat01-')) {
      console.warn(
        '[ai-provider] OAuth token stored as ANTHROPIC_API_KEY — ignored for direct API calls'
      );
    } else {
      claude = { apiKey: claudeApiKey };
    }
  }

  return {
    claude,
    gemini: secrets.GEMINI_API_KEY
      ? { apiKey: secrets.GEMINI_API_KEY }
      : undefined,
  };
}

/** Check which providers a user has credentials for (direct API only) */
export async function getAvailableProviders(
  kv: KVNamespace,
  userId: string,
  claudeToken?: string
): Promise<ProviderName[]> {
  const creds = await getProviderCredentials(kv, userId, claudeToken);
  const available: ProviderName[] = [];
  if (creds.claude) available.push('claude');
  if (creds.gemini) available.push('gemini');
  return available;
}
