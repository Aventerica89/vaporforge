/**
 * ChatSessionAgent — Durable Object for V1.5 HTTP streaming and workspace keepalive.
 *
 * Replaces the direct WS proxy (Browser -> Worker -> Container) with a
 * DO-mediated HTTP streaming architecture that provides:
 * - Stream persistence in DO storage (survives container crashes)
 * - Walk-away-and-come-back (DO collects output while browser is away)
 * - sdkSessionId continuity across reconnects
 * - Workspace keepalive sentinel via DO alarms (both WS and V1.5 paths)
 *
 * Data flow:
 * 1. Browser POST /chat with prompt -> handleChatHttp creates NDJSON stream
 * 2. DO dispatches container (fire-and-forget via startProcess)
 * 3. Container boots, runs claude-agent.js with VF_CALLBACK_URL
 * 4. claude-agent.js opens chunked POST to /internal/stream
 * 5. Worker validates JWT, routes to this DO
 * 6. DO pipes container NDJSON through to browser as-is
 * 7. Container finishes -> POST ends -> writer closes -> HTTP response ends
 *
 * Sentinel: DO alarm fires every 8 min while session is active.
 * alarm() pings the sandbox to reset the container's 10-min idle timer,
 * keeping /workspace intact. Stopped on session sleep/delete.
 *
 * Uses raw DurableObject (not @cloudflare/agents Agent) because we only
 * need HTTP request handling — no WS, no partyserver routing headers.
 */
import {
  signExecutionToken,
  verifyExecutionToken,
} from '../utils/jwt';
import {
  collectProjectSecrets,
  collectUserSecrets,
} from '../sandbox';
import { getSandbox } from '@cloudflare/sandbox';
import type { Process } from '@cloudflare/sandbox';
import type { Session } from '../types';

/** Resolve frontend model IDs to CLI aliases (e.g. sonnet1m -> sonnet[1m]) */
const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-6',
  opusplan: 'opusplan',
  sonnet1m: 'claude-sonnet-4-6',
};

/** HTTP passthrough bridge — forwards container NDJSON to browser as-is. */
interface HttpBridge {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  resolve: () => void;
  reject: (err: Error) => void;
}

/** Interval between sentinel keepalive pings (8 min — under the 10-min idle limit). */
const SENTINEL_INTERVAL_MS = 8 * 60 * 1000;

export class ChatSessionAgent {
  private state: DurableObjectState;
  private env: Env;
  private httpBridges = new Map<string, HttpBridge>();
  private bufferSeq = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * DO alarm handler — fires every 8 minutes while sentinel is active.
   * Pings the sandbox to reset the container's 10-min idle timer, keeping
   * /workspace alive. Reschedules itself automatically.
   */
  async alarm(): Promise<void> {
    const sandboxId = await this.state.storage.get<string>('sentinel:sandboxId');
    if (!sandboxId) return; // sentinel was stopped before alarm fired

    try {
      const sandbox = getSandbox(this.env.SANDBOX_CONTAINER, sandboxId);
      await sandbox.writeFile('/tmp/.vf-keepalive', String(Date.now()));
      console.log(`[ChatSessionAgent] sentinel ping: sandboxId=${sandboxId.slice(0, 8)}`);
    } catch (err) {
      // Container may be sleeping — ping attempt wakes it (that's fine too)
      console.log(`[ChatSessionAgent] sentinel ping (container wake): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Reschedule next alarm only if sentinel is still active
    const stillActive = await this.state.storage.get<string>('sentinel:sandboxId');
    if (stillActive) {
      await this.state.storage.setAlarm(Date.now() + SENTINEL_INTERVAL_MS);
    }
  }

  /**
   * Start the keepalive sentinel for a sandbox.
   * Schedules an alarm 8 minutes from now that pings the container.
   * Safe to call multiple times — idempotent (replaces existing alarm).
   */
  private async startSentinel(sandboxId: string): Promise<void> {
    await this.state.storage.put('sentinel:sandboxId', sandboxId);
    await this.state.storage.setAlarm(Date.now() + SENTINEL_INTERVAL_MS);
    console.log(`[ChatSessionAgent] sentinel started: sandboxId=${sandboxId.slice(0, 8)}`);
  }

  /**
   * Stop the keepalive sentinel.
   * Deletes the stored sandboxId (so alarm() is a no-op) and cancels the alarm.
   */
  private async stopSentinel(): Promise<void> {
    await this.state.storage.delete('sentinel:sandboxId');
    await this.state.storage.deleteAlarm();
    console.log('[ChatSessionAgent] sentinel stopped');
  }

  /**
   * Store a buffered NDJSON line to DO SQLite for replay after disconnects.
   * Keys are zero-padded so storage.list() returns them in emission order.
   * Fire-and-forget — CF guarantees durability before DO eviction.
   */
  private storeLine(line: string): void {
    const key = 'buf:' + String(this.bufferSeq++).padStart(10, '0');
    this.state.storage.put(key, line);
  }

  /**
   * Clear the stream buffer from a previous execution.
   * Called at the start of each new chat request. Awaited so new storeLine()
   * calls cannot interleave with the delete of the previous buffer's entries.
   */
  private async clearBuffer(): Promise<void> {
    this.bufferSeq = 0;
    const entries = await this.state.storage.list({ prefix: 'buf:' });
    if (entries.size > 0) {
      await this.state.storage.delete([...entries.keys()]);
    }
  }

  /**
   * HTTP request handler. Intercepts:
   * - POST /internal/stream — container callback with chunked NDJSON
   * - POST /init — session initialization with userId
   * - POST /chat — browser HTTP streaming endpoint
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/stream') {
      return this.handleContainerStream(request);
    }

    if (request.method === 'POST' && url.pathname === '/init') {
      return this.handleInit(request);
    }

    if (request.method === 'POST' && url.pathname === '/sentinel/start') {
      const body = (await request.json()) as { sandboxId: string };
      if (!body.sandboxId) {
        return new Response('Missing sandboxId', { status: 400 });
      }
      await this.startSentinel(body.sandboxId);
      return new Response('OK', { status: 200 });
    }

    if (request.method === 'POST' && url.pathname === '/sentinel/stop') {
      await this.stopSentinel();
      return new Response('OK', { status: 200 });
    }

    // Resume: serve buffered NDJSON lines from a given offset (reconnect after disconnect)
    if (request.method === 'GET' && url.pathname === '/chat/resume') {
      return this.handleResume(url);
    }

    // V1.5 HTTP streaming — browser sends chat via HTTP, gets NDJSON stream back
    if (request.method === 'POST' && url.pathname === '/chat') {
      try {
        return await this.handleChatHttp(request);
      } catch (err) {
        console.error('[ChatSessionAgent] handleChatHttp error:', err);
        return new Response(
          JSON.stringify({
            error: 'Chat session error — please try again',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Initialize DO with userId (called from session creation route).
   */
  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as { userId: string };
    await this.state.storage.put('userId', body.userId);
    return new Response('OK', { status: 200 });
  }

  /**
   * Receives chunked POST from container, verifies JWT,
   * and pipes NDJSON events through to the browser's HTTP response.
   */
  private async handleContainerStream(
    request: Request
  ): Promise<Response> {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const payload = await verifyExecutionToken(
      token,
      this.env.JWT_SECRET
    );
    if (!payload) {
      return new Response('Unauthorized', { status: 401 });
    }

    const bridge = this.httpBridges.get(payload.executionId);
    if (!bridge) {
      return new Response('No active stream for this execution', {
        status: 404,
      });
    }

    if (!request.body) {
      bridge.resolve();
      this.httpBridges.delete(payload.executionId);
      return new Response('OK', { status: 200 });
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          await bridge.writer.write(
            bridge.encoder.encode(line + '\n')
          );
          this.storeLine(line);
          this.extractMetadata(line);
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        await bridge.writer.write(
          bridge.encoder.encode(buffer + '\n')
        );
        this.storeLine(buffer);
        this.extractMetadata(buffer);
      }

      bridge.resolve();
    } catch (err) {
      console.error('[ChatSessionAgent] stream pipe error:', err);
      bridge.reject(
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      this.httpBridges.delete(payload.executionId);
    }

    return new Response('OK', { status: 200 });
  }

  /**
   * HTTP streaming endpoint — browser sends POST /chat,
   * gets back NDJSON stream of container events.
   * Same format as WS streamWs events (no UIMessageChunk translation).
   */
  private async handleChatHttp(
    request: Request
  ): Promise<Response> {
    const body = (await request.json()) as {
      sessionId: string;
      prompt: string;
      userId?: string;
      mode?: string;
      model?: string;
      autonomy?: string;
    };

    // Clear buffer from previous execution before starting a new one.
    // Awaited to prevent delete from racing with new storeLine() calls.
    await this.clearBuffer();

    const executionId = crypto.randomUUID();
    const sessionId = body.sessionId;
    if (!sessionId) {
      throw new Error('Missing sessionId in request body');
    }

    // userId comes from Worker (authenticated user) — more reliable than DO storage
    // which depends on /init having been called (race condition on new sessions,
    // never called for sessions created before V1.5).
    const userId = body.userId ||
      (await this.state.storage.get<string>('userId')) || '';
    if (!userId) {
      throw new Error('No userId available — session may need re-initialization');
    }
    if (body.userId) {
      // Persist for future use (callback stream route doesn't have it)
      this.state.storage.put('userId', body.userId).catch(() => {});
    }

    console.log(`[ChatSessionAgent] handleChatHttp: sessionId=${sessionId.slice(0, 8)}, userId=${userId.slice(0, 8)}, promptLen=${body.prompt.length}`);

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const { promise, resolve, reject } = createDeferred<void>();

    this.httpBridges.set(executionId, {
      writer,
      encoder,
      resolve,
      reject,
    });

    // Emit connected immediately so the browser knows the request was received.
    // This resets the frontend's 5-min AbortController timeout, which is critical
    // when the container is sleeping and needs 20-60s to wake before responding.
    writer.write(encoder.encode(JSON.stringify({ type: 'connected' }) + '\n')).catch(() => {});

    // Bridge timeout — if container never calls back, close the stream
    const BRIDGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const bridgeTimeout = setTimeout(() => {
      const bridge = this.httpBridges.get(executionId);
      if (bridge) {
        const line = JSON.stringify({ type: 'error', error: 'Container did not respond within 5 minutes' }) + '\n';
        bridge.writer.write(bridge.encoder.encode(line)).catch(() => {});
        bridge.resolve();
        this.httpBridges.delete(executionId);
      }
    }, BRIDGE_TIMEOUT_MS);
    promise.finally(() => clearTimeout(bridgeTimeout));

    // Heartbeat: emit every 60s to reset frontend's 5-min AbortController
    // during long tool-use sequences where the container produces no output
    // for minutes at a time (e.g. heavy agent skills doing multi-step tool use).
    const heartbeatInterval = setInterval(() => {
      const bridge = this.httpBridges.get(executionId);
      if (bridge) {
        bridge.writer.write(bridge.encoder.encode(JSON.stringify({ type: 'heartbeat' }) + '\n')).catch(() => {});
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 60000);
    promise.finally(() => clearInterval(heartbeatInterval));

    // Dispatch container (fire-and-forget)
    this.dispatchContainer(
      executionId,
      sessionId,
      body.prompt,
      userId,
      body.mode,
      body.model,
      body.autonomy
    ).catch((err) => {
      const line =
        JSON.stringify({ type: 'error', error: String(err) }) + '\n';
      writer.write(encoder.encode(line)).catch(() => {});
      writer.close().catch(() => {});
      this.httpBridges.delete(executionId);
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    // When container stream completes (or errors), close the HTTP response
    promise
      .then(() => writer.close().catch(() => {}))
      .catch(() => writer.close().catch(() => {}));

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    });
  }

  /**
   * Resume endpoint — serves buffered NDJSON lines from a given offset.
   * Called by the browser after a dropped V1.5 HTTP stream to recover
   * any missed events without re-running the agent.
   */
  private async handleResume(url: URL): Promise<Response> {
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const entries = await this.state.storage.list<string>({ prefix: 'buf:' });
    const allLines = [...entries.values()];
    const fromOffset = allLines.slice(offset);

    if (fromOffset.length === 0) {
      return new Response('', {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }

    return new Response(fromOffset.join('\n') + '\n', {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  /** Persist sdkSessionId from container events. */
  private extractMetadata(line: string): void {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (
        (event.type === 'session-init' || event.type === 'done') &&
        event.sessionId
      ) {
        this.state.storage
          .put('sdkSessionId', String(event.sessionId))
          .catch(() => {});
      }
    } catch {
      // Skip parse errors
    }
  }

  /**
   * Watch for process crashes using the SDK's waitForExit() SSE stream.
   * If claude-agent.js exits with a non-zero code (or the SSE stream errors)
   * before the bridge resolves, we emit an error event and close the bridge
   * immediately instead of waiting for the 5-minute bridge timeout.
   *
   * Called fire-and-forget after startProcess().
   */
  private async watchProcessCrash(
    executionId: string,
    process: Process
  ): Promise<void> {
    try {
      const result = await process.waitForExit();
      // Process exited — if bridge is still open and exit was non-zero, it crashed.
      const bridge = this.httpBridges.get(executionId);
      if (bridge && result.exitCode !== 0) {
        const line =
          JSON.stringify({
            type: 'error',
            error: `Container process exited with code ${result.exitCode}`,
          }) + '\n';
        bridge.writer.write(bridge.encoder.encode(line)).catch(() => {});
        bridge.resolve();
        this.httpBridges.delete(executionId);
      }
      // exit code 0: normal completion — bridge should already have resolved
      // via handleContainerStream; if it hasn't, bridge timeout will handle it.
    } catch (err) {
      // SSE stream error (container sleep, network error, etc.) — close bridge
      const bridge = this.httpBridges.get(executionId);
      if (bridge) {
        const msg = err instanceof Error ? err.message : String(err);
        const line =
          JSON.stringify({ type: 'error', error: `Container error: ${msg}` }) +
          '\n';
        bridge.writer.write(bridge.encoder.encode(line)).catch(() => {});
        bridge.resolve();
        this.httpBridges.delete(executionId);
      }
    }
  }

  /**
   * Read session from KV, get sandbox reference, spawn claude-agent.js.
   *
   * Bypasses SandboxManager.getOrWakeSandbox (and its health check)
   * because the CF Sandbox SDK auto-wakes sleeping containers on
   * any operation (writeFile, startProcess). The health check was
   * causing "Sandbox failed to wake" errors from the DO context.
   */
  private async dispatchContainer(
    executionId: string,
    sessionId: string,
    prompt: string,
    userId: string,
    mode?: string,
    model?: string,
    autonomy?: string
  ): Promise<void> {
    const sid = sessionId.slice(0, 8);
    console.log(`[ChatSessionAgent] dispatchContainer: sid=${sid} exec=${executionId.slice(0, 8)}`);

    const sdkSessionId =
      (await this.state.storage.get<string>('sdkSessionId')) || '';
    console.log(`[ChatSessionAgent] userId=${userId ? userId.slice(0, 8) : 'EMPTY'} sdkSessionId=${sdkSessionId ? sdkSessionId.slice(0, 8) : 'none'}`);

    // Read session directly from KV (no health check — SDK auto-wakes)
    const session = await this.env.SESSIONS_KV.get<Session>(
      `session:${sessionId}`,
      'json'
    );
    if (!session) {
      throw new Error(`Session not found in KV: ${sid}`);
    }
    if (session.status === 'terminated' || session.status === 'pending-delete') {
      throw new Error(`Session ${session.status}: ${sid}`);
    }
    if (!session.sandboxId) {
      throw new Error(`Session has no sandboxId: ${sid} (status=${session.status})`);
    }
    console.log(`[ChatSessionAgent] session found: sandboxId=${session.sandboxId.slice(0, 8)} status=${session.status}`);

    // Get sandbox reference (returns immediately — no container wake yet)
    const sandbox = getSandbox(
      this.env.SANDBOX_CONTAINER,
      session.sandboxId
    );

    // Generate JWT for container callback
    const token = await signExecutionToken(
      executionId,
      sessionId,
      this.env.JWT_SECRET
    );

    // Collect env vars
    const projectSecrets = collectProjectSecrets(this.env);
    const userSecrets = await collectUserSecrets(
      this.env.SESSIONS_KV,
      userId
    );
    // OAuth token is stored as claudeToken inside the user JSON object
    const userRecord = await this.env.AUTH_KV.get<{ claudeToken?: string }>(
      `user:${userId}`,
      'json'
    );
    const oauthToken = userRecord?.claudeToken || '';
    if (!oauthToken) {
      throw new Error('No Claude token found — please re-authenticate');
    }
    if (!oauthToken.startsWith('sk-ant-oat01-')) {
      throw new Error('Only OAuth tokens are accepted for sandbox sessions');
    }

    // Write prompt to context file (auto-wakes sandbox if sleeping)
    await sandbox.writeFile(
      '/tmp/vf-pending-query.json',
      JSON.stringify({
        prompt,
        sessionId,
        sdkSessionId,
        timestamp: Date.now(),
      })
    );

    // Spawn claude-agent.js via startProcess (fire-and-forget).
    // Returns immediately — process runs in background.
    // CRITICAL: startProcess env REPLACES container env (not merges).
    // Must include system essentials (PATH, HOME, NODE_PATH) or CLI fails.
    const process = await sandbox.startProcess(
      'node /opt/claude-agent/claude-agent.js',
      {
        cwd: '/workspace',
        env: {
          // System essentials (container defaults that startProcess strips)
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: '/root',
          NODE_PATH: '/usr/local/lib/node_modules',
          LANG: 'en_US.UTF-8',
          TERM: 'xterm',
          // VF runtime
          IS_SANDBOX: '1',
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          VF_CALLBACK_URL: `${this.env.WORKER_BASE_URL}/internal/stream`,
          VF_STREAM_JWT: token,
          VF_SDK_SESSION_ID: sdkSessionId,
          VF_SESSION_MODE: mode || 'agent',
          ...(model ? { VF_MODEL: MODEL_ALIASES[model] || model } : {}),
          ...(model === 'sonnet1m' ? { VF_1M_CONTEXT: '1' } : {}),
          ...(autonomy ? { VF_AUTONOMY_MODE: autonomy } : {}),
          CLAUDE_CONFIG_DIR: '/root/.config/claude',
          ...projectSecrets,
          ...userSecrets,
        },
      }
    );

    // Monitor process for crashes. waitForExit() streams process logs via SSE
    // and resolves when the process emits an exit event. If the process crashes
    // (non-zero exit or SSE stream error) before the bridge resolves, we close
    // the bridge immediately rather than waiting for the 5-min bridge timeout.
    this.watchProcessCrash(executionId, process);

    // Update lastActiveAt in KV (non-blocking)
    const updated: Session = {
      ...session,
      lastActiveAt: new Date().toISOString(),
      status: 'active',
    };
    this.env.SESSIONS_KV.put(
      `session:${sessionId}`,
      JSON.stringify(updated)
    ).catch(() => {});
  }
}

/** Simple deferred promise helper. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
