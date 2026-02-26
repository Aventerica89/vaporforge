/**
 * ChatSessionAgent — Durable Object for V1.5 HTTP streaming.
 *
 * Replaces the direct WS proxy (Browser -> Worker -> Container) with a
 * DO-mediated HTTP streaming architecture that provides:
 * - Stream persistence in DO storage (survives container crashes)
 * - Walk-away-and-come-back (DO collects output while browser is away)
 * - sdkSessionId continuity across reconnects
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
import type { Session } from '../types';

/** HTTP passthrough bridge — forwards container NDJSON to browser as-is. */
interface HttpBridge {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class ChatSessionAgent {
  private state: DurableObjectState;
  private env: Env;
  private httpBridges = new Map<string, HttpBridge>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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
          this.extractMetadata(line);
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        await bridge.writer.write(
          bridge.encoder.encode(buffer + '\n')
        );
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
    await sandbox.startProcess(
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
          VF_CALLBACK_URL: 'https://vaporforge.dev/internal/stream',
          VF_STREAM_JWT: token,
          VF_SDK_SESSION_ID: sdkSessionId,
          VF_SESSION_MODE: mode || 'agent',
          ...(model ? { VF_MODEL: model } : {}),
          ...(autonomy ? { VF_AUTONOMY_MODE: autonomy } : {}),
          CLAUDE_CONFIG_DIR: '/root/.config/claude',
          ...projectSecrets,
          ...userSecrets,
        },
      }
    );

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
