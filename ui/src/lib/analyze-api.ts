import type { CodeAnalysis } from './types';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface AnalyzeStreamEvent {
  type: 'connected' | 'partial' | 'done' | 'error';
  data?: Partial<CodeAnalysis>;
  content?: string;
}

/** Stream a structured code analysis. Yields SSE events with partial objects. */
export async function* streamAnalyze(params: {
  code: string;
  language: string;
  filePath?: string;
  provider: 'claude' | 'gemini' | 'openai';
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<AnalyzeStreamEvent> {
  const response = await fetch(`${API_BASE}/analyze/structured`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
    signal: params.signal,
  });

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: 'Analysis failed' }));
    throw new Error(
      (data as { error?: string }).error || 'Code analysis stream failed'
    );
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
          yield JSON.parse(data) as AnalyzeStreamEvent;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}
