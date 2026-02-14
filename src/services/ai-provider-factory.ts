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

/** Credentials required for each provider */
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
 */
export function createModel(
  provider: ProviderName,
  credentials: ProviderCredentials,
  modelAlias?: string
): LanguageModel {
  const modelId = resolveModelId(provider, modelAlias);

  if (provider === 'claude') {
    const key = credentials.claude?.apiKey;
    if (!key) throw new Error('Anthropic API key not configured');
    const anthropic = createAnthropic({ apiKey: key });

    // Enable extended thinking for Sonnet (other models skip gracefully)
    const alias = modelAlias || DEFAULT_MODEL[provider];
    if (alias === 'sonnet') {
      return anthropic(modelId, {
        thinking: { type: 'enabled', budgetTokens: 4096 },
      });
    }

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
 * Read provider credentials from KV.
 * Secrets are stored at `user-secrets:{userId}` as a JSON object.
 */
export async function getProviderCredentials(
  kv: KVNamespace,
  userId: string
): Promise<ProviderCredentials> {
  const raw = await kv.get(`user-secrets:${userId}`);
  if (!raw) return {};

  try {
    const secrets = JSON.parse(raw) as Record<string, string>;
    return {
      claude: secrets.ANTHROPIC_API_KEY
        ? { apiKey: secrets.ANTHROPIC_API_KEY }
        : undefined,
      gemini: secrets.GEMINI_API_KEY
        ? { apiKey: secrets.GEMINI_API_KEY }
        : undefined,
    };
  } catch {
    return {};
  }
}

/** Check which providers a user has credentials for */
export async function getAvailableProviders(
  kv: KVNamespace,
  userId: string
): Promise<ProviderName[]> {
  const creds = await getProviderCredentials(kv, userId);
  const available: ProviderName[] = [];
  if (creds.claude) available.push('claude');
  if (creds.gemini) available.push('gemini');
  return available;
}
