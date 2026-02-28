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
  provider: 'claude' | 'gemini' | 'openai';
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface QuickChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: 'claude' | 'gemini' | 'openai';
  model?: string;
  reasoning?: string;
  createdAt: string;
}

export type ProviderName = 'claude' | 'gemini' | 'openai';

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
