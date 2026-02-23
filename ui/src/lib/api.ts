import type { ApiResponse, Session, Message, FileInfo, GitStatus, GitCommit, User, McpServerConfig, Plugin, ConfigFile, ConfigCategory, AIProviderConfig, Checkpoint } from './types';
import { useDebugLog } from '@/hooks/useDebugLog';

const API_BASE = '/api';

function debugLog(
  category: 'api' | 'stream' | 'sandbox' | 'error' | 'info',
  level: 'error' | 'warn' | 'info',
  summary: string,
  detail?: string
) {
  useDebugLog.getState().addEntry({ category, level, summary, detail });
}

// Version tracking — detect deploys so the client can prompt a refresh
let _knownVersion: string | null = null;
let _updateAvailable = false;

function checkVersionHeader(response: Response) {
  const serverVersion = response.headers.get('X-VF-Version');
  if (!serverVersion) return;

  if (_knownVersion === null) {
    _knownVersion = serverVersion;
  } else if (serverVersion !== _knownVersion && !_updateAvailable) {
    _updateAvailable = true;
    window.dispatchEvent(new CustomEvent('vf:update-available', {
      detail: { from: _knownVersion, to: serverVersion },
    }));
  }
}

export function isUpdateAvailable(): boolean {
  return _updateAvailable;
}

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

  checkVersionHeader(response);

  const data = await response.json();

  if (!response.ok) {
    const errMsg = data.error || 'Request failed';
    debugLog(
      'api',
      'error',
      `${options.method || 'GET'} ${endpoint} — ${response.status}`,
      JSON.stringify(data, null, 2)
    );
    throw new Error(errMsg);
  }

  return data;
}

/** Read vf-user-id from localStorage, falling back to cookie (survives hard refresh). */
export function getPreviousUserId(): string | undefined {
  const fromStorage = localStorage.getItem('vf-user-id');
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|;\s*)vf-user-id=([^;]+)/);
  return match?.[1] || undefined;
}

/** Persist vf-user-id to both localStorage and a cookie (belt-and-suspenders). */
export function persistUserId(userId: string): void {
  localStorage.setItem('vf-user-id', userId);
  document.cookie = `vf-user-id=${userId}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Strict; Secure`;
}

// Auth API
export const authApi = {
  setupWithToken: async (token: string): Promise<{ sessionToken: string; user: User }> => {
    // Send previousUserId hint so the backend can reuse the same userId
    // when the OAuth token rotates, preserving all stored data.
    const previousUserId = getPreviousUserId();

    const response = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, previousUserId }),
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

    // Persist userId so future logins with rotated tokens keep the same identity
    if (data.data.user?.id) {
      persistUserId(data.data.user.id);
    }

    return data.data;
  },

  logout: () => {
    localStorage.removeItem('session_token');
    // Keep vf-user-id so re-login preserves data
  },

  recoverByToken: async (oldToken: string): Promise<{ recovered: number; oldUserId: string; newUserId: string }> => {
    const res = await request<{ recovered: number; oldUserId: string; newUserId: string }>(
      '/auth/recover-by-token',
      { method: 'POST', body: JSON.stringify({ oldToken }) }
    );
    if (!res.success || !res.data) throw new Error(res.error || 'Recovery failed');
    return res.data;
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
    request<Session>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  restore: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/restore`, {
      method: 'POST',
    }),

  purge: (sessionId: string) =>
    request<{ purged: boolean }>(`/sessions/${sessionId}/purge`, {
      method: 'POST',
    }),

  exec: (sessionId: string, command: string, cwd?: string) =>
    request<{ stdout: string; stderr: string; exitCode: number }>(
      `/sessions/${sessionId}/exec`,
      {
        method: 'POST',
        body: JSON.stringify({ command, cwd }),
      }
    ),

  update: (sessionId: string, data: { name?: string }) =>
    request<Session>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  clone: (sessionId: string, repo: string, branch?: string) =>
    request<{ repo: string; path: string }>(`/sessions/${sessionId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ repo, branch }),
    }),

  configStatus: (sessionId: string) =>
    request<{
      stampExists: boolean;
      stampValue: string;
      lastConfigCheck: string | null;
      sessionStatus: string;
    }>(`/sessions/${sessionId}/config-status`),

  syncConfig: (sessionId: string) =>
    request<{ synced: boolean }>(`/sessions/${sessionId}/sync-config`, {
      method: 'POST',
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
    signal?: AbortSignal,
    mode?: 'agent' | 'plan'
  ): AsyncGenerator<{
    type: string;
    id?: string;
    content?: string;
    sessionId?: string;
    fullText?: string;
    name?: string;
    input?: Record<string, unknown>;
    output?: string;
    restoredAt?: string;
  }> {
    const token = localStorage.getItem('session_token');

    const response = await fetch(`${API_BASE}/sdk/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId, prompt, cwd, mode: mode || 'agent' }),
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

  // WebSocket-based streaming (bypasses execStream SSE buffering)
  streamWs: async function* (
    sessionId: string,
    prompt: string,
    cwd?: string,
    signal?: AbortSignal,
    mode?: 'agent' | 'plan',
    model?: 'auto' | 'sonnet' | 'haiku' | 'opus',
    autonomy?: 'conservative' | 'standard' | 'autonomous'
  ): AsyncGenerator<{
    type: string;
    id?: string;
    content?: string;
    sessionId?: string;
    fullText?: string;
    name?: string;
    input?: Record<string, unknown>;
    output?: string;
    restoredAt?: string;
    usage?: { inputTokens: number; outputTokens: number };
    msgId?: string;
  }> {
    const token = localStorage.getItem('session_token');
    if (!token) throw new Error('Not authenticated');

    // Generate msgId before WS connects so caller can capture it immediately
    const msgId = crypto.randomUUID();

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      sessionId,
      prompt,
      cwd: cwd || '/workspace',
      mode: mode || 'agent',
      token,
      msgId,
      ...(model && model !== 'auto' ? { model } : {}),
      ...(autonomy ? { autonomy } : {}),
    });
    const wsUrl = `${proto}//${location.host}/api/sdk/ws?${params}`;

    // Yield msg-id first so the caller can capture it before any WS traffic
    yield { type: 'msg-id', msgId };

    const ws = new WebSocket(wsUrl);

    // Queue + resolver pattern for async iteration
    type QueueItem = { value: Record<string, unknown>; done: false } | { done: true };
    const queue: QueueItem[] = [];
    let resolve: ((item: QueueItem) => void) | null = null;
    let wsError: Error | null = null;

    function push(item: QueueItem) {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r(item);
      } else {
        queue.push(item);
      }
    }

    function pull(): Promise<QueueItem> {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise<QueueItem>((r) => { resolve = r; });
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Map protocol types to frontend event types
        switch (msg.type) {
          case 'text-delta':
            push({ value: { type: 'text', content: msg.text }, done: false });
            break;
          case 'session-init':
            push({ value: { type: 'session-init', sessionId: msg.sessionId }, done: false });
            break;
          case 'tool-start':
            push({ value: { type: 'tool-start', id: msg.id, name: msg.name, input: msg.input }, done: false });
            break;
          case 'tool-result':
            push({ value: { type: 'tool-result', id: msg.id, name: msg.name, output: msg.output }, done: false });
            break;
          case 'done':
            push({
              value: {
                type: 'done',
                sessionId: msg.sessionId,
                fullText: msg.fullText,
                ...(msg.usage ? { usage: msg.usage } : {}),
                ...(typeof msg.costUsd === 'number' ? { costUsd: msg.costUsd } : {}),
              },
              done: false,
            });
            break;
          case 'error':
            push({ value: { type: 'error', content: msg.error }, done: false });
            break;
          case 'session-reset':
            push({ value: { type: 'session-reset' }, done: false });
            break;
          case 'process-exit':
            push({ value: { type: 'ws-exit', exitCode: msg.exitCode }, done: false });
            // Signal end of stream after a brief delay for final frames
            setTimeout(() => push({ done: true }), 50);
            break;
          default:
            // Forward unknown types as-is
            push({ value: msg, done: false });
        }
      } catch {
        // Non-JSON frame, skip
      }
    };

    ws.onerror = () => {
      wsError = new Error('WebSocket connection failed');
      push({ done: true });
    };

    ws.onclose = () => {
      push({ done: true });
    };

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        ws.close();
      }, { once: true });
    }

    // Wait for connection to open
    await new Promise<void>((ok, fail) => {
      ws.onopen = () => ok();
      // If onerror fires before onopen, reject
      const origError = ws.onerror;
      ws.onerror = (e) => {
        if (origError) (origError as (ev: Event) => void)(e);
        fail(new Error('WebSocket connection failed'));
      };
    });
    // Restore the standard error handler after open
    ws.onerror = () => {
      wsError = new Error('WebSocket error');
      push({ done: true });
    };

    try {
      while (true) {
        const item = await pull();
        if (item.done) break;
        yield item.value as {
          type: string;
          id?: string;
          content?: string;
          sessionId?: string;
          fullText?: string;
          name?: string;
          input?: Record<string, unknown>;
          output?: string;
          restoredAt?: string;
        };
      }
    } finally {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    if (wsError) throw wsError;
  },

  // Fetch buffered chunks from /tmp/vf-stream-{msgId}.jsonl for reconnect replay
  fetchReplay: async (
    sessionId: string,
    msgId: string,
    offset: number
  ): Promise<{ chunks: string[]; total: number } | null> => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(
        `${API_BASE}/sdk/replay/${encodeURIComponent(sessionId)}?msgId=${encodeURIComponent(msgId)}&offset=${offset}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  // Persist assistant message to KV after WS stream completes
  // Returns triggered alerts (if any) so the caller can show in-app notifications
  persistMessage: async (
    sessionId: string,
    content: string,
    sdkSessionId: string,
    costUsd?: number
  ): Promise<{ triggeredAlerts?: AlertConfig[] }> => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`${API_BASE}/sdk/persist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId, content, sdkSessionId, ...(typeof costUsd === 'number' ? { costUsd } : {}) }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Best-effort persistence — don't break the UI
    }
    return {};
  },
};

// User Config API
export const userApi = {
  getClaudeMd: () =>
    request<{ content: string }>('/user/claude-md'),

  saveClaudeMd: (content: string) =>
    request<{ saved: boolean }>('/user/claude-md', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
};

// Auto-Context API
export const autoContextApi = {
  get: () =>
    request<{ enabled: boolean }>('/user/auto-context'),

  set: (enabled: boolean) =>
    request<{ enabled: boolean }>('/user/auto-context', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
};

// Per-session budget ceiling API
export const maxBudgetApi = {
  get: () =>
    request<{ maxBudgetUsd: number | null }>('/user/max-budget'),

  set: (maxBudgetUsd: number | null) =>
    request<{ maxBudgetUsd: number | null }>('/user/max-budget', {
      method: 'PUT',
      body: JSON.stringify({ maxBudgetUsd }),
    }),
};

// VF Internal Rules API
export const vfRulesApi = {
  get: () =>
    request<{ content: string; isDefault: boolean }>('/user/vf-rules'),

  save: (content: string) =>
    request<{ saved: boolean }>('/user/vf-rules', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  reset: () =>
    request<{ content: string }>('/user/vf-rules', {
      method: 'DELETE',
    }),
};

// Secrets API
export const secretsApi = {
  list: () =>
    request<Array<{ name: string; hint: string }>>('/secrets'),

  add: (name: string, value: string) =>
    request<{ name: string; hint: string }>('/secrets', {
      method: 'POST',
      body: JSON.stringify({ name, value }),
    }),

  remove: (name: string) =>
    request<{ deleted: boolean }>(`/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
};

// MCP API
export const mcpApi = {
  list: () =>
    request<McpServerConfig[]>('/mcp'),

  add: (server: Omit<McpServerConfig, 'addedAt' | 'enabled'>) =>
    request<McpServerConfig>('/mcp', {
      method: 'POST',
      body: JSON.stringify(server),
    }),

  /** Add multiple servers sequentially, return results per server */
  addBatch: async (
    servers: Array<Omit<McpServerConfig, 'addedAt' | 'enabled'>>
  ): Promise<{ added: string[]; failed: Array<{ name: string; error: string }> }> => {
    const added: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const server of servers) {
      const result = await request<McpServerConfig>('/mcp', {
        method: 'POST',
        body: JSON.stringify(server),
      });
      if (result.success) {
        added.push(server.name);
      } else {
        failed.push({ name: server.name, error: result.error || 'Failed' });
      }
    }
    return { added, failed };
  },

  update: (name: string, server: Partial<Omit<McpServerConfig, 'addedAt' | 'enabled' | 'name'>>) =>
    request<McpServerConfig>(`/mcp/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(server),
    }),

  remove: (name: string) =>
    request<{ deleted: boolean }>(`/mcp/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  toggle: (name: string) =>
    request<McpServerConfig>(`/mcp/${encodeURIComponent(name)}/toggle`, {
      method: 'PUT',
    }),

  /** Batch health-check all enabled HTTP servers */
  ping: () =>
    request<Record<string, {
      status: string;
      httpStatus?: number;
      tools?: string[];
      toolCount?: number;
    }>>('/mcp/ping', {
      method: 'POST',
    }),

  /** Single server health-check */
  pingOne: (name: string) =>
    request<{
      status: string;
      httpStatus?: number;
      tools?: string[];
      toolCount?: number;
    }>(`/mcp/${encodeURIComponent(name)}/ping`, {
      method: 'POST',
    }),
};

// Plugin Sources API (custom catalog repos)
export interface PluginSource {
  id: string;
  url: string;
  label: string;
  addedAt: string;
}

export const pluginSourcesApi = {
  list: () =>
    request<PluginSource[]>('/plugin-sources'),

  add: (url: string, label?: string) =>
    request<PluginSource>('/plugin-sources', {
      method: 'POST',
      body: JSON.stringify({ url, label }),
    }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/plugin-sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  refresh: () =>
    request<{ plugins: any[]; refreshedAt: string }>('/plugin-sources/refresh', {
      method: 'POST',
    }),

  catalog: () =>
    request<{ plugins: any[]; refreshedAt: string | null }>('/plugin-sources/catalog'),
};

// Plugins API
export const pluginsApi = {
  list: () =>
    request<Plugin[]>('/plugins'),

  add: (plugin: Omit<Plugin, 'id' | 'addedAt' | 'updatedAt'>) =>
    request<Plugin>('/plugins', {
      method: 'POST',
      body: JSON.stringify(plugin),
    }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/plugins/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  toggle: (id: string, data: { enabled: boolean; itemType?: string; itemName?: string }) =>
    request<Plugin>(`/plugins/${encodeURIComponent(id)}/toggle`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  discover: (repoUrl: string) =>
    request<Plugin>('/plugins/discover', {
      method: 'POST',
      body: JSON.stringify({ repoUrl }),
    }),

  refresh: () =>
    request<{ refreshed: number; plugins: Plugin[] }>('/plugins/refresh', {
      method: 'POST',
    }),

  sync: (sessionId: string) =>
    request<{ synced: boolean }>(`/plugins/sync/${sessionId}`, {
      method: 'POST',
    }),
};

// Issues API (bug tracker)
// Issue type matches useIssueTracker.ts — kept lightweight to avoid circular imports
interface IssueApiShape {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'error' | 'feature' | 'suggestion';
  size: 'S' | 'M' | 'L';
  screenshots: Array<{ id: string; dataUrl: string; fileUrl?: string }>;
  claudeNote?: string;
  resolved: boolean;
  createdAt: string;
}

interface IssueTrackerDataShape {
  issues: IssueApiShape[];
  suggestions: string;
  filter: string;
  updatedAt?: string | null;
}

export const issuesApi = {
  list: () =>
    request<IssueTrackerDataShape>('/issues'),

  save: (data: { issues: IssueApiShape[]; suggestions: string; filter: string }) =>
    request<{ updatedAt: string }>('/issues', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sync: async (etag?: string): Promise<{ data: IssueTrackerDataShape | null; notModified: boolean }> => {
    const token = localStorage.getItem('session_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(etag ? { 'If-None-Match': etag } : {}),
    };
    const response = await fetch(`${API_BASE}/issues/sync`, { headers });
    checkVersionHeader(response);
    if (response.status === 304) {
      return { data: null, notModified: true };
    }
    const json = await response.json();
    return { data: json.data, notModified: false };
  },

  patch: (id: string, updates: Partial<Omit<IssueApiShape, 'id' | 'createdAt'>>) =>
    request<{ issue: IssueApiShape; updatedAt: string }>(`/issues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: () =>
    request<{ deleted: boolean }>('/issues', {
      method: 'DELETE',
    }),
};

// Favorites API
export const favoritesApi = {
  list: () =>
    request<{ favorites: Array<{ url: string; name: string; owner: string; description?: string }> }>('/favorites'),

  save: (favorites: Array<{ url: string; name: string; owner: string; description?: string }>) =>
    request<{ success: boolean }>('/favorites', {
      method: 'PUT',
      body: JSON.stringify({ favorites }),
    }),
};

// GitHub API
export const githubApi = {
  repos: (username: string) =>
    request<{ repos: any[]; cached: boolean }>(`/github/repos?username=${encodeURIComponent(username)}`),

  sync: (username: string) =>
    request<{ repos: any[]; cached: boolean }>('/github/repos/sync', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  getUsername: () =>
    request<{ username: string }>('/github/username'),

  saveUsername: (username: string) =>
    request<{ success: boolean }>('/github/username', {
      method: 'PUT',
      body: JSON.stringify({ username }),
    }),
};

// VaporFiles API (R2-backed file storage)
export interface VaporFile {
  id: string;
  key: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export const vaporFilesApi = {
  uploadBase64: (dataUrl: string, name?: string) =>
    request<{ id: string; url: string; metadata: any }>('/vaporfiles/upload-base64', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, name }),
    }),

  uploadFile: async (file: File, name?: string): Promise<ApiResponse<VaporFile>> => {
    const token = localStorage.getItem('session_token');
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);

    const response = await fetch(`${API_BASE}/vaporfiles/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    checkVersionHeader(response);
    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error || 'Upload failed';
      debugLog('api', 'error', `POST /vaporfiles/upload — ${response.status}`, JSON.stringify(data, null, 2));
      throw new Error(errMsg);
    }

    return data;
  },

  list: () => request<VaporFile[]>('/vaporfiles/list'),

  delete: (id: string) =>
    request<{ id: string }>(`/vaporfiles/${id}`, {
      method: 'DELETE',
    }),
};

// Embeddings API (semantic search)
export const embeddingsApi = {
  index: (sessionId: string) =>
    request<{ fileCount: number; duration: number; model: string }>(
      '/embeddings/index',
      { method: 'POST', body: JSON.stringify({ sessionId }) }
    ),

  status: (sessionId: string) =>
    request<{
      indexed: boolean;
      fileCount: number;
      lastIndexedAt: string | null;
      indexing: boolean;
    }>(`/embeddings/status?sessionId=${encodeURIComponent(sessionId)}`),

  search: (sessionId: string, query: string, topK?: number) =>
    request<{
      results: Array<{ path: string; score: number; snippet: string; language: string }>;
      queryTime: number;
    }>('/embeddings/search', {
      method: 'POST',
      body: JSON.stringify({ sessionId, query, topK }),
    }),
};

// AI Providers API
export const aiProvidersApi = {
  get: () =>
    request<AIProviderConfig>('/ai-providers'),

  enableGemini: (config: { defaultModel: 'flash' | 'pro' }) =>
    request<AIProviderConfig>('/ai-providers/gemini', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  disableGemini: () =>
    request<AIProviderConfig>('/ai-providers/gemini', {
      method: 'DELETE',
    }),

  enableClaude: (config: { defaultModel: 'sonnet' | 'haiku' | 'opus' }) =>
    request<AIProviderConfig>('/ai-providers/claude', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  disableClaude: () =>
    request<AIProviderConfig>('/ai-providers/claude', {
      method: 'DELETE',
    }),
};

// Config API (standalone rules, commands, agents)
export const configApi = {
  list: (category: ConfigCategory) =>
    request<ConfigFile[]>(`/config/${category}`),

  add: (category: ConfigCategory, data: { filename: string; content: string; enabled?: boolean }) =>
    request<ConfigFile>(`/config/${category}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (category: ConfigCategory, filename: string, data: { content?: string; enabled?: boolean }) =>
    request<ConfigFile>(`/config/${category}/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (category: ConfigCategory, filename: string) =>
    request<{ deleted: boolean }>(`/config/${category}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
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

  downloadArchive: (sessionId: string, path?: string) =>
    request<{ archive: string; filename: string }>(
      `/files/download-archive/${sessionId}`,
      {
        method: 'POST',
        body: JSON.stringify({ path }),
      }
    ),

  uploadBase64: (sessionId: string, filename: string, base64Data: string) =>
    request<{ path: string }>(
      `/files/upload-base64/${sessionId}`,
      {
        method: 'POST',
        body: JSON.stringify({ filename, data: base64Data }),
      }
    ),
};

// User Component Registry API
export interface UserComponentFile {
  path: string;
  content: string;
}

export interface UserComponentEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  code: string;
  dependencies: string[];
  tailwindClasses: string[];
  type?: 'snippet' | 'app';
  files?: UserComponentFile[];
  instructions?: string;
  setupScript?: string;
  agents?: string[];
  sourceUrl?: string;
  isCustom: true;
  createdAt: string;
}

export type ComponentDraft = Omit<UserComponentEntry, 'id' | 'isCustom' | 'createdAt'>;

export const userComponentsApi = {
  list: () =>
    request<UserComponentEntry[]>('/user-components'),

  save: (entry: Omit<UserComponentEntry, 'id' | 'isCustom' | 'createdAt'>) =>
    request<UserComponentEntry>('/user-components', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),

  delete: (id: string) =>
    request<{ id: string }>(`/user-components/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  generate: (prompt: string) =>
    request<ComponentDraft>('/user-components/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
};

// Checkpoints API
export const checkpointsApi = {
  list: () =>
    request<Checkpoint[]>('/checkpoints'),

  create: (data: { name: string; sessionId: string; summary: string }) =>
    request<Checkpoint>('/checkpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ id: string }>(`/checkpoints/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
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

// Billing API
export const billingApi = {
  status: () =>
    request<{ plan: 'free' | 'pro'; status: string; currentPeriodEnd?: string }>(
      '/billing/status'
    ),

  checkout: () =>
    request<{ url: string }>('/billing/checkout', { method: 'POST' }),

  portal: () =>
    request<{ url: string }>('/billing/portal', { method: 'POST' }),

  invoices: () =>
    request<{
      invoices: Array<{
        id: string;
        date: number;
        amount: number;
        currency: string;
        status: string | null;
        pdfUrl: string | null;
        hostedUrl: string | null;
      }>;
    }>('/billing/invoices'),

  alerts: {
    list: () =>
      request<{ alerts: AlertConfig[] }>('/billing/alerts'),

    create: (data: { label?: string; thresholdPct: number; channels?: Array<'in-app'> }) =>
      request<{ alert: AlertConfig }>('/billing/alerts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    toggle: (id: string) =>
      request<{ alert: AlertConfig }>(`/billing/alerts/${id}/toggle`, { method: 'PATCH' }),

    delete: (id: string) =>
      request<Record<string, never>>(`/billing/alerts/${id}`, { method: 'DELETE' }),
  },
};

export const summaryApi = {
  get: (sessionId: string) =>
    request<{ text: string; updatedAt: string; messageCount: number }>(
      `/api/sdk/summary/${sessionId}`
    ),
};

export interface AlertConfig {
  id: string;
  label: string;
  thresholdPct: number;
  enabled: boolean;
  channels: Array<'in-app'>;
  triggeredAt: string | null;
  triggeredCount: number;
  createdAt: string;
}
