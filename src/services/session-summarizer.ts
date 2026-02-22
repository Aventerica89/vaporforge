import { generateText } from 'ai';
import type { Message } from '../types';
import {
  createModel,
  getProviderCredentials,
  type ProviderCredentials,
} from './ai-provider-factory';

const SUMMARY_PROMPT = `You are summarizing a coding session for a developer who will resume it later.
Write a concise summary (10 lines max) in markdown. Include:
- What was built or fixed (1-2 lines, be specific)
- Key decisions made and why
- Files created or modified
- Exact next step or where things were left off

Be technical and specific. Omit greetings and meta-commentary.`;

/**
 * Build a session summary from a list of messages.
 * Uses AI (Haiku or Gemini Flash) if credentials are available.
 * Falls back to a rule-based compact summary otherwise.
 */
export async function buildSessionSummary(
  messages: Message[],
  credentials?: ProviderCredentials
): Promise<string> {
  const recent = messages.slice(-20);
  const date = new Date().toISOString().split('T')[0];

  if (credentials && (credentials.claude || credentials.gemini)) {
    try {
      const provider = credentials.claude ? 'claude' : 'gemini';
      const modelAlias = provider === 'claude' ? 'haiku' : 'flash';
      const model = createModel(provider, credentials, modelAlias);

      const conversation = recent
        .map((m) => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.content.slice(0, 800)}`)
        .join('\n\n');

      const { text } = await generateText({
        model,
        system: SUMMARY_PROMPT,
        prompt: `Session date: ${date}\n\nConversation:\n${conversation}`,
        maxOutputTokens: 400,
      });

      return `**Date:** ${date}\n**Messages:** ${messages.length}\n\n${text.trim()}`;
    } catch {
      // Fall through to rule-based
    }
  }

  return buildRuleBasedSummary(recent, messages.length, date);
}

function buildRuleBasedSummary(
  recent: Message[],
  totalCount: number,
  date: string
): string {
  const lastUser = [...recent].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant');

  const lines = [`**Date:** ${date}`, `**Messages:** ${totalCount}`];

  if (lastUser) {
    lines.push(`**Last request:** ${lastUser.content.slice(0, 200).replace(/\n/g, ' ')}`);
  }
  if (lastAssistant) {
    lines.push(
      `**Last action:** ${lastAssistant.content.slice(0, 300).replace(/\n/g, ' ')}`
    );
  }

  return lines.join('\n');
}

/**
 * Fetch recent messages for a session from KV and generate a summary.
 * Returns null if the session has fewer than MIN_MESSAGES messages.
 */
export async function summarizeSession(
  kv: KVNamespace,
  userId: string,
  sessionId: string
): Promise<string | null> {
  const prefix = `message:${sessionId}:`;
  const list = await kv.list({ prefix });

  if (list.keys.length < 4) return null;

  const messages: Message[] = [];
  for (const key of list.keys) {
    const msg = await kv.get<Message>(key.name, 'json');
    if (msg) messages.push(msg);
  }

  messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let credentials: ProviderCredentials | undefined;
  try {
    credentials = await getProviderCredentials(kv, userId);
  } catch {}

  return buildSessionSummary(messages, credentials);
}
