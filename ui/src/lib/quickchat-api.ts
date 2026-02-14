import type { ApiResponse } from './types';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface QuickChatMeta {
  id: string;
  title: string;
  provider: 'claude' | 'gemini';
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface QuickChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: 'claude' | 'gemini';
  model?: string;
  reasoning?: string;
  createdAt: string;
}

/** SSE stream event from /quickchat/stream */
export interface QuickChatStreamEvent {
  type: 'connected' | 'text' | 'reasoning' | 'error' | 'done';
  content?: string;
  fullText?: string;
}

/** Stream a quick chat message. Yields SSE events. */
export async function* streamQuickChat(params: {
  chatId: string;
  message: string;
  provider: 'claude' | 'gemini';
  model?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): AsyncGenerator<QuickChatStreamEvent> {
  const response = await fetch(`${API_BASE}/quickchat/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
    signal: params.signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Stream failed' }));
    throw new Error((data as { error?: string }).error || 'Quick chat stream failed');
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          yield JSON.parse(data) as QuickChatStreamEvent;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

export type ProviderName = 'claude' | 'gemini';

export interface QuickChatListResponse {
  chats: QuickChatMeta[];
  availableProviders: ProviderName[];
}

/** List quick chat conversations + available providers */
export async function listQuickChats(): Promise<QuickChatListResponse> {
  const response = await fetch(`${API_BASE}/quickchat/list`, {
    headers: getAuthHeaders(),
  });
  const data = (await response.json()) as ApiResponse<QuickChatListResponse>;
  // Backwards-compatible: handle old response shape (array) and new (object)
  if (data.data && Array.isArray(data.data)) {
    return { chats: data.data as unknown as QuickChatMeta[], availableProviders: [] };
  }
  return data.data || { chats: [], availableProviders: [] };
}

/** Get messages for a specific chat */
export async function getQuickChatHistory(
  chatId: string
): Promise<QuickChatMessage[]> {
  const response = await fetch(
    `${API_BASE}/quickchat/${encodeURIComponent(chatId)}/history`,
    { headers: getAuthHeaders() }
  );
  const data = (await response.json()) as ApiResponse<QuickChatMessage[]>;
  return data.data || [];
}

/** Delete a quick chat */
export async function deleteQuickChat(chatId: string): Promise<void> {
  await fetch(
    `${API_BASE}/quickchat/${encodeURIComponent(chatId)}`,
    { method: 'DELETE', headers: getAuthHeaders() }
  );
}
