const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface TransformStreamEvent {
  type: 'connected' | 'text' | 'error' | 'done';
  content?: string;
  fullText?: string;
}

/** Stream a code transformation. Yields SSE events. */
export async function* streamTransform(params: {
  code: string;
  instruction: string;
  language: string;
  filePath?: string;
  provider: 'claude' | 'gemini';
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<TransformStreamEvent> {
  const response = await fetch(`${API_BASE}/transform/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
    signal: params.signal,
  });

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: 'Transform failed' }));
    throw new Error(
      (data as { error?: string }).error || 'Code transform stream failed'
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
          yield JSON.parse(data) as TransformStreamEvent;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}
