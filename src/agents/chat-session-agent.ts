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
import { isValidNpmPackageName } from '../utils/validate-npm-package';
import {
  collectProjectSecrets,
  collectUserSecrets,
} from '../sandbox';
import { assembleSandboxConfig } from '../config-assembly';
import type { SandboxConfig } from '../sandbox';
import { getSandbox } from '@cloudflare/sandbox';
import type { Process, Sandbox } from '@cloudflare/sandbox';
import type { Session } from '../types';
import { readAllOAuthTokens, refreshTokenIfExpired, writeOAuthTokens, markServerExpired } from '../api/mcp-oauth';

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
  /** Called by handleContainerStream when container first connects — cancels the bridge timeout. */
  cancelBridgeTimeout: () => void;
}

/** Interval between sentinel keepalive pings (8 min — under the 10-min idle limit). */
const SENTINEL_INTERVAL_MS = 8 * 60 * 1000;

/**
 * Maximum NDJSON lines retained in the replay buffer.
 * CF DO storage.list() silently truncates results at ~128KB — capping at 2000 lines
 * keeps us safely under that limit even for large events (~50 bytes × 2000 = 100KB).
 * Oldest lines are pruned as new ones arrive (rolling window).
 */
const MAX_BUFFER_LINES = 2000;

/** Max time to wait for a tool approval before auto-denying (5 min). */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export class ChatSessionAgent {
  private state: DurableObjectState;
  private env: Env;
  private httpBridges = new Map<string, HttpBridge>();
  private wsBridges = new Map<string, WebSocket>();
  private bufferSeq = 0;
  /** Generation counter — incremented at the start of each new execution.
   * Stored in DO SQLite so it survives eviction. Buffer keys use the format
   * `buf:{gen}:{seq}` to prevent stale keys from a prior generation mixing
   * with new keys when the DO is evicted mid-clearBuffer (Issue #102). */
  private bufferGen = 0;
  private pendingApprovals = new Map<string, (approved: boolean) => void>();
  private approvalPollCounts = new Map<string, { lastMinute: number; count: number }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Load bufferGen from storage on construction so it survives DO eviction.
    // blockConcurrencyWhile ensures this completes before any fetch() is served.
    this.state.blockConcurrencyWhile(async () => {
      this.bufferGen = (await this.state.storage.get<number>('bufferGen')) ?? 0;
    });
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
      const sandbox = getSandbox(this.env.Sandbox, sandboxId);
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
    const key = `buf:${this.bufferGen}:` + String(this.bufferSeq++).padStart(10, '0');
    this.state.storage.put(key, line);
    // Prune the oldest line once the buffer exceeds the cap (rolling window).
    // Prevents storage.list() from hitting CF's ~128KB result size limit on long sessions.
    if (this.bufferSeq > MAX_BUFFER_LINES) {
      const oldest = `buf:${this.bufferGen}:` + String(this.bufferSeq - MAX_BUFFER_LINES - 1).padStart(10, '0');
      this.state.storage.delete(oldest).catch(() => {});
    }
  }

  /**
   * Clear the stream buffer from the previous generation and advance the generation counter.
   * Called at the start of each new chat request. Awaited so new storeLine() calls cannot
   * interleave with the delete of the previous generation's entries.
   *
   * Generation-based keys (`buf:{gen}:{seq}`) prevent stale high-numbered keys from a prior
   * generation mixing with new keys when the DO is evicted mid-clearBuffer (Issue #102).
   * After incrementing bufferGen, the previous generation's prefix is a distinct namespace
   * that can be deleted independently of any new writes using the new generation prefix.
   */
  private async clearBuffer(): Promise<void> {
    this.bufferSeq = 0;
    const prevGen = this.bufferGen;
    // Increment generation and persist before deleting old keys.
    // If the DO is evicted after this put but before the deletes, the next
    // run will load the new generation and write fresh buf:{newGen}:* keys,
    // while old buf:{prevGen}:* keys are simply ignored (different prefix).
    this.bufferGen = prevGen + 1;
    await this.state.storage.put('bufferGen', this.bufferGen);

    // Retry up to 3 times — if the DO was just woken from eviction, the first
    // storage.list() may fail transiently. Without retries this throws and returns
    // a 500 to the browser with no recovery path.
    let entries: Map<string, unknown> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        entries = await this.state.storage.list({ prefix: `buf:${prevGen}:` });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise<void>((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
    if (entries && entries.size > 0) {
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

    // Trust model: /sentinel/start and /sentinel/stop are internal Worker→DO routes.
    // They are called exclusively from src/api/sessions.ts via DO stub.fetch() after
    // the Worker has already authenticated the user session JWT. These endpoints are
    // not reachable from the browser — the Worker proxies all /api/* routes and does
    // not expose DO-internal paths (/sentinel/*) to external callers. No credential
    // check is added here by design; the DO trust boundary is the Worker itself.
    if (request.method === 'POST' && url.pathname === '/sentinel/start') {
      const body = (await request.json()) as { sandboxId: string };
      if (!body.sandboxId) {
        return new Response('Missing sandboxId', { status: 400 });
      }
      await this.startSentinel(body.sandboxId);
      return new Response('OK', { status: 200 });
    }

    // Trust model: same as /sentinel/start — internal Worker→DO route only.
    // See comment above for full trust model explanation.
    if (request.method === 'POST' && url.pathname === '/sentinel/stop') {
      await this.stopSentinel();
      return new Response('OK', { status: 200 });
    }

    // Resume: serve buffered NDJSON lines from a given offset (reconnect after disconnect)
    if (request.method === 'GET' && url.pathname === '/chat/resume') {
      return this.handleResume(url);
    }

    // Container polls this to learn if user approved/denied a tool (Standard mode)
    if (request.method === 'GET' && url.pathname.startsWith('/internal/approval/')) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const payload = await verifyExecutionToken(token, this.env.JWT_SECRET);
      if (!payload) {
        return new Response('Unauthorized', { status: 401 });
      }
      const approvalId = url.pathname.replace('/internal/approval/', '');

      // Rate limit: max 60 polls per minute per approvalId
      const now = Date.now();
      const poll = this.approvalPollCounts.get(approvalId) ?? { lastMinute: now, count: 0 };
      if (now - poll.lastMinute > 60000) {
        poll.lastMinute = now;
        poll.count = 0;
      }
      poll.count++;
      this.approvalPollCounts.set(approvalId, poll);
      if (poll.count > 60) {
        return new Response('Too Many Requests', { status: 429 });
      }

      const resolver = this.pendingApprovals.get(approvalId);
      if (resolver === undefined) {
        // Not in memory — check DO storage to distinguish eviction from already-resolved
        const stored = await this.state.storage.get<string>(`approval:${approvalId}`);
        if (stored === 'approved' || stored === 'denied') {
          // Resolved before DO eviction — report the stored decision
          return new Response(JSON.stringify({ status: 'resolved', approved: stored === 'approved' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (stored === 'pending') {
          // DO was evicted while approval was in-flight — container should abort
          return new Response(JSON.stringify({ status: 'evicted' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Never registered — invalid approvalId
        return new Response(JSON.stringify({ status: 'resolved', approved: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Still pending
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Browser submits approve/deny for a pending tool permission request
    if (request.method === 'POST' && url.pathname === '/approve') {
      const body = (await request.json()) as { approvalId: string; approved: boolean };
      const resolver = this.pendingApprovals.get(body.approvalId);
      if (resolver) {
        this.pendingApprovals.delete(body.approvalId);
        this.approvalPollCounts.delete(body.approvalId);
        // Persist resolution so container can read it even after a DO eviction.
        // Schedule cleanup after 30s — long enough for the container to poll and
        // receive the decision, but short enough to prevent unbounded storage growth.
        this.state.storage.put(`approval:${body.approvalId}`, body.approved ? 'approved' : 'denied').catch(() => {});
        setTimeout(() => {
          this.state.storage.delete(`approval:${body.approvalId}`).catch(() => {});
        }, 30_000);
        resolver(body.approved);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // V1.5 WebSocket streaming — browser upgrades to WS for real-time chat
    if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/ws') {
      return this.handleWsUpgrade(request, url);
    }

    // Container WebSocket upgrade — real-time NDJSON stream from container
    if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/internal/container-ws') {
      return await this.handleContainerWsUpgrade(request, url);
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
   * Receives chunked POST from container, verifies JWT, and routes to
   * the active bridge (HTTP or WebSocket). Falls back to orphan buffering
   * if the DO was force-evicted while the bridge was alive.
   */
  private async handleContainerStream(
    request: Request
  ): Promise<Response> {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const payload = await verifyExecutionToken(token, this.env.JWT_SECRET);
    if (!payload) {
      return new Response('Unauthorized', { status: 401 });
    }
    const { executionId } = payload;

    // 1. HTTP bridge (in-memory fast path)
    const httpBridge = this.httpBridges.get(executionId);
    if (httpBridge) {
      httpBridge.cancelBridgeTimeout();
      return this.pipeToHttpBridge(request, httpBridge, executionId);
    }

    // 2. WS bridge — in-memory first, then recover via hibernation tag if DO was evicted
    let ws = this.wsBridges.get(executionId);
    if (!ws) {
      const wsList = this.state.getWebSockets(`exec:${executionId}`);
      if (wsList.length > 0) {
        ws = wsList[0];
        this.wsBridges.set(executionId, ws);
      }
    }
    if (ws) {
      return this.pipeToWsBridge(request, ws, executionId);
    }

    // 3. DO was force-evicted — buffer to storage so browser can resume
    const knownSession = await this.state.storage.get<string>(`exec:${executionId}`);
    if (knownSession) {
      return this.handleOrphanedStream(request, executionId);
    }

    return new Response('No active stream for this execution', { status: 404 });
  }

  /**
   * Pipe container NDJSON to an active HTTP bridge (existing V1.5 path).
   * Pads each write to >1KB to force Chrome's Fetch ReadableStream to flush immediately.
   */
  private async pipeToHttpBridge(
    request: Request,
    bridge: HttpBridge,
    executionId: string
  ): Promise<Response> {
    if (!request.body) {
      bridge.resolve();
      this.httpBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
      return new Response('OK', { status: 200 });
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const FLUSH_PAD = ' '.repeat(1024) + '\n';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          await bridge.writer.write(bridge.encoder.encode(line + '\n' + FLUSH_PAD));
          this.storeLine(line);
          this.extractMetadata(line);
          this.maybeRegisterApproval(line);
        }
      }

      if (buffer.trim()) {
        await bridge.writer.write(bridge.encoder.encode(buffer + '\n' + FLUSH_PAD));
        this.storeLine(buffer);
        this.extractMetadata(buffer);
        this.maybeRegisterApproval(buffer);
      }

      bridge.resolve();
    } catch (err) {
      console.error('[ChatSessionAgent] HTTP stream pipe error:', err);
      bridge.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.httpBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
    }

    return new Response('OK', { status: 200 });
  }

  /**
   * Pipe container NDJSON to an active WebSocket bridge.
   * Translates each NDJSON line to UIMessageStream format (or raw JSON for VF custom events).
   */
  private async pipeToWsBridge(
    request: Request,
    ws: WebSocket,
    executionId: string
  ): Promise<Response> {
    if (!request.body) {
      ws.close(1000, 'done');
      this.wsBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
      this.state.storage.delete(`ws-meta:${executionId}`).catch(() => {});
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
          this.storeLine(line);
          this.extractMetadata(line);
          this.maybeRegisterApproval(line);
          const frame = ndjsonToUIStreamFrame(line);
          if (frame !== null) ws.send(frame);
        }
      }

      if (buffer.trim()) {
        this.storeLine(buffer);
        this.extractMetadata(buffer);
        this.maybeRegisterApproval(buffer);
        const frame = ndjsonToUIStreamFrame(buffer);
        if (frame !== null) ws.send(frame);
      }

      ws.close(1000, 'done');
    } catch (err) {
      console.error('[ChatSessionAgent] WS stream pipe error:', err);
      try {
        ws.send('3:' + JSON.stringify(String(err instanceof Error ? err.message : err)) + '\n');
        ws.close(1011, 'Stream error');
      } catch { /* ws may already be closed */ }
    } finally {
      this.wsBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
      this.state.storage.delete(`ws-meta:${executionId}`).catch(() => {});
    }

    return new Response('OK', { status: 200 });
  }

  /**
   * The DO was force-evicted while a bridge was active — httpBridges is empty but
   * the executionId is known (persisted in SQLite). Buffer the container's remaining
   * output to the replay buffer so the browser can recover it via /chat/resume.
   * The browser connection is already dropped, so we buffer only (no pipe).
   */
  private async handleOrphanedStream(
    request: Request,
    executionId: string
  ): Promise<Response> {
    if (!request.body) {
      await this.state.storage.delete(`exec:${executionId}`);
      return new Response('OK', { status: 200 });
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          this.storeLine(line);
          this.extractMetadata(line);
        }
      }
      if (buf.trim()) {
        this.storeLine(buf);
        this.extractMetadata(buf);
      }
    } finally {
      await this.state.storage.delete(`exec:${executionId}`);
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

    // Guard: reject double-dispatch if a container execution is already in-flight.
    // Each handleChatHttp call generates a new executionId, so httpBridges having
    // any entry means a container is already running for this DO instance.
    if (this.httpBridges.size > 0) {
      return new Response(
        JSON.stringify({ error: 'A response is already in progress. Please wait for it to complete.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    // Bridge timeout — if container never calls back to /internal/stream within the window,
    // close the stream with an error. Increased to 10 min to allow for cold container starts
    // plus heavy skill pre-flight (e.g. /claude-automation-recommender takes >5 min to boot).
    // Cancelled immediately when the container first connects (cancelBridgeTimeout below).
    const BRIDGE_TIMEOUT_MS = 10 * 60 * 1000;
    let bridgeTimeoutId: ReturnType<typeof setTimeout>;
    const cancelBridgeTimeout = () => clearTimeout(bridgeTimeoutId);

    this.httpBridges.set(executionId, {
      writer,
      encoder,
      resolve,
      reject,
      cancelBridgeTimeout,
    });

    // Persist executionId → sessionId so /internal/stream can buffer output even
    // if this DO instance is force-evicted before the container calls back.
    // Cleaned up in handleContainerStream's finally block.
    await this.state.storage.put(`exec:${executionId}`, sessionId);

    // Extend DO lifetime for the full duration of the stream.
    // Without this, CF may evict the DO instance after handleChatHttp returns
    // the Response (which it does immediately, handing off the ReadableStream).
    this.state.waitUntil(promise);

    // Emit connected immediately so the browser knows the request was received.
    // This resets the frontend's 5-min AbortController timeout, which is critical
    // when the container is sleeping and needs 20-60s to wake before responding.
    writer.write(encoder.encode(JSON.stringify({ type: 'connected' }) + '\n')).catch(() => {});

    bridgeTimeoutId = setTimeout(() => {
      const bridge = this.httpBridges.get(executionId);
      if (bridge) {
        const line = JSON.stringify({ type: 'error', error: 'Container did not respond within 10 minutes' }) + '\n';
        bridge.writer.write(bridge.encoder.encode(line)).catch(() => {});
        bridge.resolve();
        this.httpBridges.delete(executionId);
      }
    }, BRIDGE_TIMEOUT_MS);
    promise.finally(cancelBridgeTimeout);

    // Heartbeat: emit every 60s to reset frontend's 5-min AbortController
    // during long tool-use sequences where the container produces no output
    // for minutes at a time (e.g. heavy agent skills doing multi-step tool use).
    const heartbeatInterval = setInterval(() => {
      const bridge = this.httpBridges.get(executionId);
      if (bridge) {
        // Pad to >1KB so Chrome's Fetch ReadableStream flushes the chunk immediately.
        // Chrome buffers small chunks below ~1KB before delivering them to reader.read().
        // The padding line is all whitespace — streamV15's `if (!line.trim()) continue` skips it.
        const hbPayload = JSON.stringify({ type: 'heartbeat' }) + '\n' + ' '.repeat(1024) + '\n';
        bridge.writer.write(bridge.encoder.encode(hbPayload)).catch(() => {});
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
        'Content-Encoding': 'none',
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
    const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
    if (isNaN(rawOffset) || rawOffset < 0) {
      return new Response('Invalid offset parameter', { status: 400 });
    }
    const offset = rawOffset;

    // Paginate to avoid CF's ~128KB storage.list() result size cap.
    // Each page fetches 200 entries; we loop until a page returns fewer than 200.
    // Use generation-prefixed keys so only the current execution's lines are returned
    // (Issue #102: stale prior-generation keys have a different prefix and are ignored).
    const allLines: string[] = [];
    let lastKey: string | undefined;
    while (true) {
      const page = await this.state.storage.list<string>({
        prefix: `buf:${this.bufferGen}:`,
        limit: 200,
        ...(lastKey ? { startAfter: lastKey } : {}),
      });
      for (const [k, v] of page) {
        allLines.push(v);
        lastKey = k;
      }
      if (page.size < 200) break;
    }

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

  /**
   * Accept a WebSocket upgrade from the browser.
   * Generates an executionId, tags the WS with it for hibernation recovery,
   * and stores metadata (userId, sessionId) in SQLite.
   * The browser sends the first WS message `{ type: 'chat', prompt, ... }` to start a run.
   */
  private handleWsUpgrade(request: Request, url: URL): Response {
    const userId = url.searchParams.get('userId') || '';
    const sessionId = url.searchParams.get('sessionId') || '';
    if (!userId || !sessionId) {
      return new Response('Missing userId or sessionId', { status: 400 });
    }

    const executionId = crypto.randomUUID();
    const { 0: client, 1: server } = new WebSocketPair();
    // Tag with executionId so getWebSockets() can recover the WS after DO eviction
    this.state.acceptWebSocket(server, [`exec:${executionId}`]);

    // Persist metadata for webSocketMessage (survives DO hibernation)
    this.state.storage.put(`ws-meta:${executionId}`, { userId, sessionId }).catch(() => {});

    // Immediately notify browser that the WS is ready
    server.send(JSON.stringify({ type: 'connected', executionId }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Accept a WebSocket upgrade from the container (real-time NDJSON stream).
   * Token is already validated by the Worker. We extract executionId from the
   * query param and tag the WS so webSocketMessage() can route container frames.
   */
  private async handleContainerWsUpgrade(request: Request, url: URL): Promise<Response> {
    const executionId = url.searchParams.get('executionId') || '';
    if (!executionId) {
      return new Response('Missing executionId', { status: 400 });
    }

    // Validate JWT — same check as the HTTP /internal/stream route.
    // WS upgrades can't carry Authorization headers, so token is in query param.
    const token = url.searchParams.get('token') || '';
    try {
      const payload = await verifyExecutionToken(token, this.env.JWT_SECRET);
      if (!payload || payload.executionId !== executionId) {
        return new Response('Token/executionId mismatch', { status: 403 });
      }
    } catch {
      return new Response('Invalid or expired token', { status: 403 });
    }

    // Cancel HTTP bridge timeout — container is alive and sending data.
    // Without this, the 10-min timeout fires even while the container is streaming.
    const httpBridge = this.httpBridges.get(executionId);
    if (httpBridge) httpBridge.cancelBridgeTimeout();

    const { 0: client, 1: server } = new WebSocketPair();
    // Tag with `container:` prefix — distinguishes from browser WS (`exec:` prefix)
    this.state.acceptWebSocket(server, [`container:${executionId}`]);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Process a single NDJSON line received from the container via WebSocket.
   * Stores to replay buffer, translates to UIMessageStream, sends to browser WS.
   */
  private handleContainerWsMessage(
    executionId: string,
    message: string | ArrayBuffer
  ): void {
    const text = typeof message === 'string'
      ? message.trim()
      : new TextDecoder().decode(message).trim();
    if (!text) return;

    this.storeLine(text);
    this.extractMetadata(text);
    this.maybeRegisterApproval(text);

    // HTTP bridge path (browser connected via /api/v15/chat HTTP streaming)
    const httpBridge = this.httpBridges.get(executionId);
    if (httpBridge) {
      // Pad to >1KB so Chrome's Fetch ReadableStream flushes the chunk immediately.
      const FLUSH_PAD = ' '.repeat(1024) + '\n';
      httpBridge.writer.write(httpBridge.encoder.encode(text + '\n' + FLUSH_PAD)).catch(() => {});
      return;
    }

    // WS bridge path (browser connected via WebSocket)
    const browserWs = this.wsBridges.get(executionId)
      ?? this.state.getWebSockets(`exec:${executionId}`)[0];
    if (!browserWs) return; // browser disconnected — buffered above for replay

    const frame = ndjsonToUIStreamFrame(text);
    if (frame !== null) {
      try {
        browserWs.send(frame);
      } catch {
        // Browser WS may have closed — ignore, replay buffer has the frame
      }
    }
  }

  /**
   * CF DO WebSocket message handler (hibernating WebSocket protocol).
   * Called when the browser sends a WS message. The first message must be
   * `{ type: 'chat', prompt, mode?, model?, autonomy? }` to dispatch the container.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Route container WS messages separately from browser WS messages
    const tags = this.state.getTags(ws);
    const containerTag = tags.find((t) => t.startsWith('container:'));
    if (containerTag) {
      this.handleContainerWsMessage(containerTag.slice(10), message);
      return;
    }

    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (data.type !== 'chat') return;

    // Recover executionId from the WS tag assigned at upgrade time
    const execTag = tags.find((t) => t.startsWith('exec:'));
    if (!execTag) return;
    const executionId = execTag.slice(5);

    const meta = await this.state.storage.get<{ userId: string; sessionId: string }>(
      `ws-meta:${executionId}`
    );
    if (!meta) {
      ws.send('3:' + JSON.stringify('WS session metadata not found') + '\n');
      ws.close(1011, 'Missing metadata');
      return;
    }

    const prompt = String(data.prompt || '');
    if (!prompt) return;

    // Guard: reject double-dispatch if a container execution is already in-flight.
    // wsBridges holds an entry for the duration of an active WS execution.
    if (this.wsBridges.has(executionId)) {
      ws.send('3:' + JSON.stringify('A response is already in progress. Please wait for it to complete.') + '\n');
      return;
    }

    // Register in-memory bridge so pipeToWsBridge can find the socket immediately
    this.wsBridges.set(executionId, ws);

    // Persist executionId → sessionId for orphan buffering (if DO is evicted mid-stream)
    await this.state.storage.put(`exec:${executionId}`, meta.sessionId);

    await this.clearBuffer();

    // Dispatch container. webSocketMessage is awaited by CF before hibernation,
    // so the full setup (KV reads, file writes, startProcess) completes before
    // the DO can sleep.
    try {
      await this.dispatchContainer(
        executionId,
        meta.sessionId,
        prompt,
        meta.userId,
        data.mode as string | undefined,
        data.model as string | undefined,
        data.autonomy as string | undefined
      );
    } catch (err) {
      ws.send('3:' + JSON.stringify(String(err instanceof Error ? err.message : err)) + '\n');
      ws.close(1011, 'Dispatch error');
      this.wsBridges.delete(executionId);
    }
  }

  /**
   * Remove a WebSocket entry from wsBridges by socket reference.
   * Safe to call when the socket may be either a browser or container WS.
   * Also deletes the associated exec and ws-meta storage keys.
   */
  private removeBridgeBySocket(ws: WebSocket): void {
    for (const [executionId, bridge] of this.wsBridges) {
      if (bridge === ws) {
        this.wsBridges.delete(executionId);
        this.state.storage.delete(`exec:${executionId}`).catch(() => {});
        this.state.storage.delete(`ws-meta:${executionId}`).catch(() => {});
        break;
      }
    }
  }

  /**
   * CF DO WebSocket close handler — handles both container and browser WS closes.
   */
  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const tags = this.state.getTags(ws);

    // Container WS closed — normal (1000) means done, abnormal means error
    const containerTag = tags.find((t) => t.startsWith('container:'));
    if (containerTag) {
      const executionId = containerTag.slice(10);
      if (code === 1000) {
        // Container finished cleanly — resolve HTTP bridge or close browser WS
        const httpBridge = this.httpBridges.get(executionId);
        if (httpBridge) {
          httpBridge.resolve();
          this.httpBridges.delete(executionId);
        } else {
          const browserWs = this.wsBridges.get(executionId)
            ?? this.state.getWebSockets(`exec:${executionId}`)[0];
          if (browserWs) {
            try { browserWs.close(1000, 'done'); } catch { /* already closed */ }
          }
        }
      } else {
        // Abnormal close — emit error to browser
        this.emitBridgeError(executionId, `Container stream ended unexpectedly: ${code} ${reason || 'no reason'}`);
      }
      // Cleanup
      this.wsBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
      this.state.storage.delete(`ws-meta:${executionId}`).catch(() => {});
      return;
    }

    // Browser WS closed — clean up any in-memory bridge and storage keys for this socket
    this.removeBridgeBySocket(ws);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    const tags = this.state.getTags(ws);

    // Container WS error — emit error to browser and clean up
    const containerTag = tags.find((t) => t.startsWith('container:'));
    if (containerTag) {
      const executionId = containerTag.slice(10);
      this.emitBridgeError(executionId, `Container WS error: ${String(error)}`);
      this.wsBridges.delete(executionId);
      this.state.storage.delete(`exec:${executionId}`).catch(() => {});
      this.state.storage.delete(`ws-meta:${executionId}`).catch(() => {});
      return;
    }

    // Browser WS error — clean up bridge reference and storage keys
    this.removeBridgeBySocket(ws);
  }

  /** Persist sdkSessionId and containerBuild from container events. */
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
      if (event.type === 'done' && event.containerBuild) {
        this.state.storage
          .put('containerBuild', String(event.containerBuild))
          .catch(() => {});
      }
      if (event.type === 'session-reset') {
        this.state.storage.put('sdkSessionId', '').catch(() => {});
      }
    } catch {
      // Skip parse errors
    }
  }

  /** Registers a pending approval promise when a confirmation chunk flows through the stream. */
  private maybeRegisterApproval(line: string): void {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'confirmation' && typeof event.approvalId === 'string') {
        const approvalId = event.approvalId;
        if (!this.pendingApprovals.has(approvalId)) {
          // Persist to DO storage so containers can detect eviction (approval:id = 'pending')
          this.state.storage.put(`approval:${approvalId}`, 'pending').catch(() => {});
          // Store the resolver; timeout auto-denies if browser never responds
          void new Promise<boolean>((resolve) => {
            this.pendingApprovals.set(approvalId, resolve);
            setTimeout(() => {
              if (this.pendingApprovals.has(approvalId)) {
                this.pendingApprovals.delete(approvalId);
                this.approvalPollCounts.delete(approvalId);
                this.state.storage.delete(`approval:${approvalId}`).catch(() => {});
                resolve(false);
              }
            }, APPROVAL_TIMEOUT_MS);
          });
        }
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
      if (result.exitCode === 0) return; // normal exit — bridge resolves via handleContainerStream

      const errMsg = `Container process exited with code ${result.exitCode}`;
      this.emitBridgeError(executionId, errMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitBridgeError(executionId, `Container error: ${msg}`);
    }
  }

  /** Emit an error to the active bridge (HTTP or WS) and clean up. */
  private emitBridgeError(executionId: string, errMsg: string): void {
    const httpBridge = this.httpBridges.get(executionId);
    if (httpBridge) {
      const line = JSON.stringify({ type: 'error', error: errMsg }) + '\n';
      httpBridge.writer.write(httpBridge.encoder.encode(line)).catch(() => {});
      httpBridge.resolve();
      this.httpBridges.delete(executionId);
      return;
    }

    const ws = this.wsBridges.get(executionId) ??
      this.state.getWebSockets(`exec:${executionId}`)[0];
    if (ws) {
      try {
        ws.send('3:' + JSON.stringify(errMsg) + '\n');
        ws.close(1011, 'Process error');
      } catch { /* ws may already be closed */ }
      this.wsBridges.delete(executionId);
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
    const storedBuild =
      (await this.state.storage.get<string>('containerBuild')) || '';
    console.log(`[ChatSessionAgent] userId=${userId ? userId.slice(0, 8) : 'EMPTY'} sdkSessionId=${sdkSessionId ? sdkSessionId.slice(0, 8) : 'none'} storedBuild=${storedBuild || 'none'}`);

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
      this.env.Sandbox,
      session.sandboxId
    );

    // Generate JWT for container callback
    const token = await signExecutionToken(
      executionId,
      sessionId,
      this.env.JWT_SECRET
    );

    // Build container WS callback URL (real-time streaming, no CF buffering).
    // WS upgrades can't carry Authorization headers, so token goes in query param.
    const wsCallbackUrl = new URL(
      `/internal/container-ws?executionId=${encodeURIComponent(executionId)}&token=${encodeURIComponent(token)}`,
      this.env.WORKER_BASE_URL
    );
    wsCallbackUrl.protocol = wsCallbackUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsCallbackUrlStr = wsCallbackUrl.toString();

    // Collect env vars + config in parallel (all KV reads)
    const projectSecrets = collectProjectSecrets(this.env);
    const [sandboxConfig, userSecrets, userRecord] = await Promise.all([
      assembleSandboxConfig(this.env.SESSIONS_KV, userId),
      collectUserSecrets(this.env.SESSIONS_KV, userId),
      this.env.AUTH_KV.get<{ claudeToken?: string }>(`user:${userId}`, 'json'),
    ]);
    const oauthToken = userRecord?.claudeToken || '';
    if (!oauthToken) {
      throw new Error('No Claude token found — please re-authenticate');
    }
    if (!oauthToken.startsWith('sk-ant-oat01-')) {
      throw new Error('Only OAuth tokens are accepted for sandbox sessions');
    }

    // Load MCP OAuth tokens (pre-flight refresh). Tokens are injected as
    // Authorization: Bearer headers in ~/.claude.json — NOT via .credentials.json,
    // which Claude CLI does not read for HTTP MCP server auth.
    const oauthTokensByName = new Map<string, string>();
    try {
      const allTokens = await readAllOAuthTokens(this.env.SESSIONS_KV, userId);
      if (allTokens.length > 0) {
        await Promise.all(
          allTokens.map(async (t) => {
            const updated = await refreshTokenIfExpired(t);
            if (updated === null) {
              await markServerExpired(this.env.SESSIONS_KV, userId, t.serverName);
              return;
            }
            if (updated !== t) {
              await writeOAuthTokens(this.env.SESSIONS_KV, userId, t.serverName, updated);
            }
            oauthTokensByName.set(t.serverName, updated.accessToken);
          })
        );
        console.log(`[ChatSessionAgent] ${sid}: loaded ${oauthTokensByName.size} MCP OAuth token(s) for header injection`);
      }
    } catch (err) {
      console.error(`[ChatSessionAgent] ${sid}: MCP OAuth token load failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Inject/refresh config into container (MCP servers, CLAUDE.md, plugins, creds).
    // After container sleep wipes disk, this restores everything the SDK needs.
    // Returns true if full injection was needed (container slept / fresh disk).
    // ensureContainerConfig returns both the injection flag and the OAuth-patched MCP config.
    // Using the patched config for CLAUDE_MCP_SERVERS ensures Bearer tokens reach the SDK.
    const { needsFullInjection: didFullInject, patchedMcp } = await this.ensureContainerConfig(sandbox, sessionId, sandboxConfig, oauthTokensByName);

    // If the container slept (stamp missing → full injection), the SDK session
    // files on disk are gone. Resuming a dead session hangs for 4+ minutes
    // until the inactivity timeout fires. Clear sdkSessionId to force a fresh start.
    let effectiveSessionId = sdkSessionId;
    if (didFullInject && sdkSessionId) {
      console.log(`[ChatSessionAgent] container slept — clearing stale sdkSessionId=${sdkSessionId.slice(0, 8)}`);
      effectiveSessionId = '';
      this.state.storage.put('sdkSessionId', '').catch(() => {});
    }

    // Build CLAUDE_MCP_SERVERS from the OAuth-patched config (same object written to ~/.claude.json).
    // Building from sandboxConfig directly (before OAuth patching) would omit Authorization headers.
    const mcpConfigStr = Object.keys(patchedMcp).length > 0
      ? JSON.stringify(patchedMcp)
      : null;

    // Strip [command:/name] or [agent:/name] UI prefix before sending to Claude.
    // Same logic as WS path (sdk.ts handleSdkWs). Without this, Claude sees
    // the raw prefix and tries to invoke a Skill tool that doesn't exist in
    // the sandbox, causing a 5-minute hang until the bridge times out.
    const cmdPrefixMatch = prompt.match(/^\[(command|agent):\/([^\]]+)\]\n/);
    let sdkPrompt = prompt;
    if (cmdPrefixMatch) {
      const [fullMatch, kind, name] = cmdPrefixMatch;
      const body = prompt.slice(fullMatch.length);
      sdkPrompt = kind === 'agent'
        ? `Use the "${name}" agent (available via the Task tool) to handle this request. The agent's instructions:\n\n${body}`
        : `The user is running the /${name} command. Follow the instructions below:\n\n${body}`;
    }

    // Write prompt to context file (auto-wakes sandbox if sleeping).
    // Use effectiveSessionId (not sdkSessionId) — effectiveSessionId is cleared
    // to '' when didFullInject is true (container slept/woke), preventing
    // claude-agent.js from trying to resume a dead SDK session.
    await sandbox.writeFile(
      '/tmp/vf-pending-query.json',
      JSON.stringify({
        prompt: sdkPrompt,
        sessionId,
        sdkSessionId: effectiveSessionId,
        timestamp: Date.now(),
      })
    );

    // Guard: check if claude-agent.js is already running in the container.
    // Catches cases where httpBridges was cleared (DO eviction/restart) but
    // the container process is still alive from a previous execution.
    const runningProcesses = await sandbox.listProcesses();
    const agentProcess = runningProcesses.find(
      (p) => p.command.includes('claude-agent.js') && (p.status === 'running' || p.status === 'starting')
    );
    if (agentProcess) {
      // Staleness check: if the process has been running for >10 minutes it is likely
      // stuck or orphaned (e.g. DO was evicted mid-stream). Proceed with a fresh start.
      const stale =
        agentProcess.startTime != null &&
        Date.now() - new Date(agentProcess.startTime).getTime() > 600_000;
      if (stale) {
        console.warn(`[ChatSessionAgent] stale process detected (>10min), restarting`);
      } else {
        console.warn(`[ChatSessionAgent] dispatchContainer: claude-agent.js already running, skipping startProcess`);
        return;
      }
    }

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
          VF_WS_CALLBACK_URL: wsCallbackUrlStr,
          VF_STREAM_JWT: token, // kept for approval polling (HTTP)
          VF_SDK_SESSION_ID: effectiveSessionId,
          VF_STORED_BUILD: storedBuild,
          VF_SESSION_MODE: mode || 'agent',
          ...(model ? { VF_MODEL: MODEL_ALIASES[model] || model } : {}),
          ...(model === 'sonnet1m' ? { VF_1M_CONTEXT: '1' } : {}),
          ...(autonomy ? { VF_AUTONOMY_MODE: autonomy } : {}),
          CLAUDE_CONFIG_DIR: '/root/.claude',
          ...projectSecrets,
          ...userSecrets,
          ...(mcpConfigStr ? { CLAUDE_MCP_SERVERS: mcpConfigStr } : {}),
          VF_AUTO_CONTEXT: sandboxConfig.autoContext === false ? '0' : '1',
          ...(sandboxConfig.maxBudgetUsd ? { VF_MAX_BUDGET_USD: String(sandboxConfig.maxBudgetUsd) } : {}),
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

  /**
   * Ensure container has all config files (MCP, CLAUDE.md, plugins, creds).
   * After container sleep wipes disk, this restores everything the SDK needs.
   * Mirrors SandboxManager.injectAllConfig + refreshMcpConfig logic.
   */
  private async ensureContainerConfig(
    sandbox: Sandbox,
    sessionId: string,
    config: SandboxConfig,
    oauthTokensByName: Map<string, string> = new Map()
  ): Promise<{ needsFullInjection: boolean; patchedMcp: Record<string, Record<string, unknown>> }> {
    const sid = sessionId.slice(0, 8);

    // Check stamp — if valid, skip full injection (only refresh MCP + creds)
    let needsFullInjection = true;
    try {
      const stampResult = await sandbox.exec(
        'cat /root/.claude/.vf-config-stamp 2>/dev/null || echo ""',
        { timeout: 3000 }
      );
      const stamp = (stampResult.stdout || '').trim();
      if (stamp && stamp.startsWith(sessionId)) needsFullInjection = false;
    } catch { /* container not ready or file missing */ }

    // Merge all MCP server configs (user + plugin + gemini)
    const mergedMcp: Record<string, Record<string, unknown>> = {
      ...(config.mcpServers || {}),
      ...(config.pluginConfigs?.mcpServers || {}),
      ...(config.geminiMcpServers || {}),
    };

    if (needsFullInjection) {
      console.log(`[ChatSessionAgent] ${sid}: config stamp missing, full injection`);
      // sandbox.exec is the CF Sandbox API (runs inside container), not child_process
      await sandbox.exec(
        'mkdir -p /root/.claude/agents /root/.claude/commands /root/.claude/rules',
        { timeout: 5000 }
      );

      // CLAUDE.md (VF rules + user content)
      const mdParts: string[] = [];
      if (config.vfRules?.trim()) mdParts.push(config.vfRules!.trim());
      if (config.claudeMd?.trim()) mdParts.push(config.claudeMd!.trim());
      if (mdParts.length) {
        await sandbox.writeFile('/root/.claude/CLAUDE.md', mdParts.join('\n\n---\n\n'));
        // Record what was injected so syncConfigFromContainer can detect
        // in-container edits vs unchanged injection. Without this sentinel,
        // sync-back falls through to legacy compare and overwrites KV with
        // stale container content when the user edits via Settings mid-session.
        await sandbox.writeFile(
          '/root/.claude/.vf-injected-claude-md',
          config.claudeMd?.trim() || ''
        );
      }

      // Plugin + user config files (agents, commands, rules)
      for (const fs of [config.pluginConfigs, config.userConfigs]) {
        if (!fs) continue;
        for (const a of fs.agents) await sandbox.writeFile(`/root/.claude/agents/${a.filename}`, a.content);
        for (const c of fs.commands) await sandbox.writeFile(`/root/.claude/commands/${c.filename}`, c.content);
        for (const r of fs.rules) await sandbox.writeFile(`/root/.claude/rules/${r.filename}`, r.content);
      }

      // Gemini agent
      if (config.injectGeminiAgent) {
        await sandbox.writeFile('/root/.claude/agents/gemini-expert.md',
          '---\nname: gemini-expert\ndescription: Delegate reasoning to Google Gemini via MCP tools\n---\n' +
          'You are a Gemini relay agent. For EVERY user request:\n' +
          '1. Use `gemini_quick_query` for simple questions\n' +
          '2. Use `gemini_analyze_code` for code review\n' +
          '3. Use `gemini_codebase_analysis` for multi-file review\n' +
          "Present Gemini's response directly. Do NOT add your own analysis."
        );
      }

      // Pre-install npx packages for MCP servers (sandbox.exec = CF container API)
      const npxPkgs: string[] = [];
      for (const cfg of Object.values(mergedMcp)) {
        const c = cfg as Record<string, unknown>;
        if (c.command === 'npx' && Array.isArray(c.args)) {
          const pkg = (c.args as string[]).find((a: string) => !a.startsWith('-'));
          if (pkg) {
            if (!isValidNpmPackageName(pkg)) {
              console.warn(`[ChatSessionAgent] rejected invalid npm package name "${pkg}" — skipping install`);
            } else {
              npxPkgs.push(pkg);
            }
          }
        }
      }
      if (npxPkgs.length) {
        try {
          await sandbox.exec(
            `npm install -g ${npxPkgs.join(' ')} --prefer-offline 2>&1 || true`,
            { timeout: 60_000 }
          );
        } catch { /* non-fatal */ }
      }

      // Write stamp
      await sandbox.writeFile('/root/.claude/.vf-config-stamp', `${sessionId}:${Date.now()}`);
      console.log(`[ChatSessionAgent] ${sid}: config injected, stamp written`);
    }

    // Patch HTTP MCP servers that have OAuth tokens with Authorization: Bearer header.
    // Claude CLI reads headers from ~/.claude.json mcpServers entries, not .credentials.json.
    if (oauthTokensByName.size > 0) {
      const patched: string[] = [];
      const skippedNoUrl: string[] = [];
      for (const [name, cfg] of Object.entries(mergedMcp)) {
        const token = oauthTokensByName.get(name);
        if (token && cfg.url) {
          const existingHeaders = typeof cfg.headers === 'object' && cfg.headers !== null
            ? cfg.headers as Record<string, string>
            : {};
          mergedMcp[name] = { ...cfg, headers: { ...existingHeaders, Authorization: `Bearer ${token}` } };
          patched.push(name);
        } else if (token && !cfg.url) {
          skippedNoUrl.push(name);
        }
      }
      if (patched.length) console.log(`[ChatSessionAgent] ${sid}: OAuth headers applied to: ${patched.join(', ')}`);
      if (skippedNoUrl.length) console.warn(`[ChatSessionAgent] ${sid}: OAuth token found but server has no url (not HTTP?): ${skippedNoUrl.join(', ')}`);
      const unmatched = [...oauthTokensByName.keys()].filter(n => !mergedMcp[n]);
      if (unmatched.length) console.warn(`[ChatSessionAgent] ${sid}: OAuth tokens have no matching MCP server: ${unmatched.join(', ')}`);
    }

    // Always refresh MCP config + credential files (handles hot-add between messages)
    if (Object.keys(mergedMcp).length > 0) {
      await sandbox.writeFile('/root/.claude.json', JSON.stringify({ mcpServers: mergedMcp }, null, 2));
    }
    if (config.credentialFiles?.length) {
      for (const cred of config.credentialFiles) {
        // Validate path to prevent directory traversal attacks.
        // Reject any path containing '..' or outside allowed prefixes.
        const allowedPrefixes = ['/root/', '/workspace/', '/tmp/'];
        const hasTraversal = cred.path.includes('..');
        const hasAllowedPrefix = allowedPrefixes.some((p) => cred.path.startsWith(p));
        if (hasTraversal || !hasAllowedPrefix) {
          console.warn(`[ChatSessionAgent] ${sid}: rejected credential file path "${cred.path}" — must start with /root/, /workspace/, or /tmp/ and contain no '..'`);
          continue;
        }
        const parentDir = cred.path.substring(0, cred.path.lastIndexOf('/'));
        if (parentDir) await sandbox.mkdir(parentDir, { recursive: true });
        await sandbox.writeFile(cred.path, cred.content);
      }
      // Append credential file locations to CLAUDE.md (only on full injection)
      if (needsFullInjection) {
        const credSection = '\n\n---\n## Injected Credential Files\n\n' +
          'Pre-loaded by VaporForge. Ready to use — do NOT ask for these.\n\n' +
          config.credentialFiles.map(c => `- \`${c.path}\``).join('\n');
        try {
          const mdResult = await sandbox.exec('cat /root/.claude/CLAUDE.md 2>/dev/null || echo ""', { timeout: 3000 });
          const existing = (mdResult.stdout || '').trimEnd();
          await sandbox.writeFile('/root/.claude/CLAUDE.md', existing + credSection);
        } catch {
          await sandbox.writeFile('/root/.claude/CLAUDE.md', credSection.trim());
        }
      }
    }

    return { needsFullInjection, patchedMcp: mergedMcp };
  }
}

/**
 * Translate a container NDJSON line to the AI SDK UIMessageStream wire format.
 *
 * Standard events → opcode:data\n
 *   0:  text-delta
 *   g:  reasoning-delta
 *   9:  tool-start
 *   a:  tool-result
 *   d:  done
 *   3:  error
 *
 * VF custom events (confirmation, commit, checkpoint-list, persona,
 * chain-of-thought, session-init, system-info, etc.) → raw JSON\n
 *
 * Dropped events (heartbeat, connected) → null
 */
function ndjsonToUIStreamFrame(line: string): string | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  switch (event.type) {
    case 'text-delta':
      return '0:' + JSON.stringify(String(event.text ?? '')) + '\n';
    case 'reasoning-delta':
      return 'g:' + JSON.stringify({ type: 'reasoning', reasoning: String(event.text ?? '') }) + '\n';
    case 'tool-start':
      return '9:' + JSON.stringify({
        toolCallId: String(event.id ?? ''),
        toolName: String(event.name ?? ''),
        args: (event.input as Record<string, unknown>) ?? {},
      }) + '\n';
    case 'tool-result':
      return 'a:' + JSON.stringify({
        toolCallId: String(event.id ?? ''),
        result: event.output ?? '',
      }) + '\n';
    case 'done':
      return 'd:' + JSON.stringify({
        finishReason: String(event.finishReason ?? 'stop'),
        usage: event.usage ?? {},
        sessionId: event.sessionId,
        fullText: event.fullText,
        costUsd: event.costUsd,
        containerBuild: event.containerBuild,
      }) + '\n';
    case 'error':
      return '3:' + JSON.stringify(String(event.error ?? 'Unknown error')) + '\n';
    case 'heartbeat':
    case 'connected':
      return null; // no-op on WS — these were only needed for HTTP chunk flushing
    default:
      // VF custom events pass through as raw JSON for the hook to handle
      return line + '\n';
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
