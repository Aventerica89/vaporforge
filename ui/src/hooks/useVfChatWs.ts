/**
 * WebSocket-based streaming for VF main chat (V1.5 WS path).
 *
 * Replaces HTTP streaming (`streamV15`) when `useWsStreaming` is enabled.
 * Bypasses Chrome's 1KB Fetch ReadableStream buffering entirely — WebSocket
 * frames are delivered immediately with no padding hacks required.
 *
 * Protocol (backend: ChatSessionAgent DO /ws endpoint):
 *   Connect: GET /api/v15/ws?sessionId=X&token=JWT
 *   Send:    { type: 'chat', prompt, mode?, model?, autonomy? }
 *   Receive: UIMessageStream frames (0:, g:, 9:, a:, d:, 3:)
 *            OR raw JSON for VF custom events (confirmation, commit, etc.)
 */

type VfStreamEvent = { type: string; [key: string]: unknown };

/**
 * Parse a UIMessageStream opcode frame into a VF event shape
 * compatible with the existing useSandbox sendMessage event loop.
 */
function parseUIStreamFrame(data: string): VfStreamEvent | null {
  const colon = data.indexOf(':');
  if (colon < 1) return null;
  const opcode = data.slice(0, colon);
  let payload: unknown;
  try {
    payload = JSON.parse(data.slice(colon + 1).trim());
  } catch {
    payload = data.slice(colon + 1).trim();
  }

  switch (opcode) {
    case '0':
      return { type: 'text', content: String(payload) };
    case '3':
      return { type: 'error', content: String(payload) };
    case '9': {
      const tc = payload as { toolCallId: string; toolName: string; args: Record<string, unknown> };
      return { type: 'tool-start', id: tc.toolCallId, name: tc.toolName, input: tc.args };
    }
    case 'a': {
      const tr = payload as { toolCallId: string; result: unknown };
      return { type: 'tool-result', id: tr.toolCallId, name: '', output: String(tr.result ?? '') };
    }
    case 'd': {
      const d = payload as {
        finishReason: string;
        usage: Record<string, unknown>;
        sessionId?: string;
        fullText?: string;
        costUsd?: number;
        containerBuild?: string;
      };
      return {
        type: 'done',
        finishReason: d.finishReason,
        usage: d.usage,
        sessionId: d.sessionId,
        fullText: d.fullText,
        costUsd: d.costUsd,
        containerBuild: d.containerBuild,
      };
    }
    case 'g': {
      const r = payload as { reasoning: string };
      return { type: 'reasoning', content: r.reasoning };
    }
    default:
      return null;
  }
}

/**
 * Async generator that streams chat events over WebSocket.
 * Yields events in the same shape as sdkApi.streamV15 so the existing
 * sendMessage event loop in useSandbox.ts requires no changes.
 */
export async function* streamVfChatWs(
  sessionId: string,
  prompt: string,
  _cwd?: string,
  signal?: AbortSignal,
  mode?: string,
  model?: string,
  autonomy?: string
): AsyncGenerator<VfStreamEvent> {
  const token = localStorage.getItem('session_token');
  if (!token) throw new Error('Not authenticated');

  const base = window.location.origin.replace(/^http/, 'ws');
  const wsUrl =
    `${base}/api/v15/ws` +
    `?sessionId=${encodeURIComponent(sessionId)}` +
    `&token=${encodeURIComponent(token)}`;

  const ws = new WebSocket(wsUrl);

  // Promise-based queue: WS messages are pushed here, the generator drains them.
  const queue: VfStreamEvent[] = [];
  let closed = false;
  let closeError: Error | null = null;
  let notify: (() => void) | null = null;

  const push = (event: VfStreamEvent) => {
    queue.push(event);
    notify?.();
    notify = null;
  };

  const markClosed = (err?: Error) => {
    closed = true;
    closeError = err ?? null;
    notify?.();
    notify = null;
  };

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: 'chat',
        prompt,
        ...(mode ? { mode } : {}),
        ...(model && model !== 'auto' ? { model } : {}),
        ...(autonomy ? { autonomy } : {}),
      })
    );
  };

  ws.onmessage = (e: MessageEvent<string>) => {
    const data = (e.data as string).trim();
    if (!data) return;

    if (data.startsWith('{')) {
      // Raw JSON — VF custom event (confirmation, commit, session-init, etc.)
      try {
        const event = JSON.parse(data) as VfStreamEvent;
        if (event.type === 'connected') return; // acknowledge only — no-op
        push(event);
      } catch { /* ignore malformed frames */ }
    } else if (data.indexOf(':') > 0) {
      // UIMessageStream frame
      const event = parseUIStreamFrame(data);
      if (event) push(event);
    }
  };

  ws.onclose = () => markClosed();
  ws.onerror = () => markClosed(new Error('WebSocket connection error'));

  signal?.addEventListener('abort', () => {
    ws.close(1000, 'Aborted');
  }, { once: true });

  // Drain the queue as events arrive
  while (!closed || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => { notify = resolve; });
    }
    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }

  if (closeError) throw closeError;
}
