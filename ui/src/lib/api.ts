import type { ApiResponse, Session, Message, FileInfo, GitStatus, GitCommit, User } from './types';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('session_token');

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Auth API
export const authApi = {
  setupWithToken: async (token: string): Promise<{ sessionToken: string; user: User }> => {
    const response = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await response.json() as ApiResponse<{
      sessionToken: string;
      user: User;
    }> & { debug?: string };

    if (!response.ok || !data.success || !data.data) {
      const msg = data.debug
        ? `${data.error}: ${data.debug}`
        : (data.error || 'Authentication failed');
      throw new Error(msg);
    }

    return data.data;
  },

  logout: () => {
    localStorage.removeItem('session_token');
  },
};

// Sessions API
export const sessionsApi = {
  list: () => request<Session[]>('/sessions/list'),

  get: (sessionId: string) => request<Session>(`/sessions/${sessionId}`),

  create: (data: { name?: string; gitRepo?: string; branch?: string }) =>
    request<Session>('/sessions/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resume: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/resume`, {
      method: 'POST',
    }),

  sleep: (sessionId: string) =>
    request<{ status: string }>(`/sessions/${sessionId}/sleep`, {
      method: 'POST',
    }),

  terminate: (sessionId: string) =>
    request<{ status: string }>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  exec: (sessionId: string, command: string, cwd?: string) =>
    request<{ stdout: string; stderr: string; exitCode: number }>(
      `/sessions/${sessionId}/exec`,
      {
        method: 'POST',
        body: JSON.stringify({ command, cwd }),
      }
    ),

  clone: (sessionId: string, repo: string, branch?: string) =>
    request<{ repo: string; path: string }>(`/sessions/${sessionId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ repo, branch }),
    }),

  execStream: async function* (
    sessionId: string,
    command: string,
    cwd?: string
  ): AsyncGenerator<{ type: string; content?: string; exitCode?: number }> {
    const token = localStorage.getItem('session_token');

    const response = await fetch(`${API_BASE}/sessions/${sessionId}/exec-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ command, cwd }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Stream request failed' }));
      throw new Error((data as { error?: string }).error || 'Stream request failed');
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
            yield JSON.parse(data);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  },
};

// Chat API
export const chatApi = {
  send: (
    sessionId: string,
    message: string,
    context?: { currentFile?: string; selectedCode?: string }
  ) =>
    request<Message>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message, context }),
    }),

  history: (sessionId: string) =>
    request<Message[]>(`/chat/history/${sessionId}`),

  stream: async function* (
    sessionId: string,
    message: string,
    context?: { currentFile?: string; selectedCode?: string }
  ): AsyncGenerator<{ type: string; content?: string }> {
    const token = localStorage.getItem('session_token');

    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId, message, context }),
    });

    if (!response.ok) {
      throw new Error('Stream request failed');
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
            yield JSON.parse(data);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  },
};

// SDK API - True progressive streaming via Agent SDK
export const sdkApi = {
  stream: async function* (
    sessionId: string,
    prompt: string,
    cwd?: string,
    signal?: AbortSignal
  ): AsyncGenerator<{
    type: string;
    content?: string;
    sessionId?: string;
    fullText?: string;
    name?: string;
    input?: Record<string, unknown>;
    output?: string;
  }> {
    const token = localStorage.getItem('session_token');

    const response = await fetch(`${API_BASE}/sdk/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId, prompt, cwd }),
      signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'SDK stream failed' }));
      throw new Error((data as { error?: string }).error || 'SDK stream failed');
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
            yield JSON.parse(data);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  },
};

// Files API
export const filesApi = {
  list: (sessionId: string, path: string = '/workspace') =>
    request<FileInfo[]>(`/files/list/${sessionId}?path=${encodeURIComponent(path)}`),

  read: (sessionId: string, path: string) =>
    request<{ path: string; content: string }>(
      `/files/read/${sessionId}?path=${encodeURIComponent(path)}`
    ),

  write: (sessionId: string, path: string, content: string) =>
    request<{ path: string }>(`/files/write/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),

  delete: (sessionId: string, path: string) =>
    request<{ path: string }>(
      `/files/delete/${sessionId}?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' }
    ),

  mkdir: (sessionId: string, path: string) =>
    request<{ path: string }>(`/files/mkdir/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  move: (sessionId: string, from: string, to: string) =>
    request<{ from: string; to: string }>(`/files/move/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),

  search: (sessionId: string, query: string, type: 'name' | 'content' = 'name') =>
    request<string[]>(
      `/files/search/${sessionId}?q=${encodeURIComponent(query)}&type=${type}`
    ),

  diff: (sessionId: string, path: string) =>
    request<{ path: string; diff: string }>(
      `/files/diff/${sessionId}?path=${encodeURIComponent(path)}`
    ),
};

// Git API
export const gitApi = {
  status: (sessionId: string) =>
    request<GitStatus>(`/git/status/${sessionId}`),

  log: (sessionId: string, limit: number = 20) =>
    request<GitCommit[]>(`/git/log/${sessionId}?limit=${limit}`),

  diff: (sessionId: string, file?: string, staged?: boolean) => {
    let url = `/git/diff/${sessionId}`;
    const params = new URLSearchParams();
    if (file) params.set('file', file);
    if (staged) params.set('staged', 'true');
    if (params.toString()) url += `?${params}`;
    return request<{ diff: string }>(url);
  },

  stage: (sessionId: string, files: string[]) =>
    request<{ staged: string[] }>(`/git/stage/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  unstage: (sessionId: string, files: string[]) =>
    request<{ unstaged: string[] }>(`/git/unstage/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  commit: (sessionId: string, message: string) =>
    request<{ hash: string; message: string }>(`/git/commit/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  push: (sessionId: string, remote?: string, branch?: string, force?: boolean) =>
    request<{ success: boolean }>(`/git/push/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch, force }),
    }),

  pull: (sessionId: string, remote?: string, branch?: string, rebase?: boolean) =>
    request<{ output: string }>(`/git/pull/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch, rebase }),
    }),

  branches: (sessionId: string) =>
    request<Array<{ name: string; upstream: string | null; current: boolean }>>(
      `/git/branches/${sessionId}`
    ),

  checkout: (sessionId: string, branch: string, create?: boolean) =>
    request<{ branch: string }>(`/git/checkout/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ branch, create }),
    }),
};
