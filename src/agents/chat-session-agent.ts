/**
 * ChatSessionAgent — Durable Object extending Agent (from @cloudflare/agents).
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
 */
import { Agent } from '@cloudflare/agents';
import type { AgentContext } from '@cloudflare/agents';
import {
  signExecutionToken,
  verifyExecutionToken,
} from '../utils/jwt';
import { SandboxManager } from '../sandbox';
import { assembleSandboxConfig } from '../config-assembly';
import {
  collectProjectSecrets,
  collectUserSecrets,
} from '../sandbox';
import { getSandbox } from '@cloudflare/sandbox';

/** HTTP passthrough bridge — forwards container NDJSON to browser as-is. */
interface HttpBridge {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class ChatSessionAgent extends Agent<Env> {
  private httpBridges = new Map<string, HttpBridge>();

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
  }

  /**
   * HTTP request handler. Intercepts:
   * - POST /internal/stream — container callback with chunked NDJSON
   * - POST /init — session initialization with userId
   * - POST /chat — browser HTTP streaming endpoint
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/stream') {
      return this.handleContainerStream(request);
    }

    if (request.method === 'POST' && url.pathname === '/init') {
      return this.handleInit(request);
    }

    // V1.5 HTTP streaming — browser sends chat via HTTP, gets NDJSON stream back
    if (request.method === 'POST' && url.pathname === '/chat') {
      return this.handleChatHttp(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Initialize DO with userId (called from session creation route).
   */
  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as { userId: string };
    await this.ctx.storage.put('userId', body.userId);
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
      prompt: string;
      mode?: string;
      model?: string;
      autonomy?: string;
    };

    const executionId = crypto.randomUUID();
    const sessionId = this.name;

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

    // Dispatch container (fire-and-forget)
    this.dispatchContainer(
      executionId,
      sessionId,
      body.prompt
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
        this.ctx.storage
          .put('sdkSessionId', String(event.sessionId))
          .catch(() => {});
      }
    } catch {
      // Skip parse errors
    }
  }

  /**
   * Wakes container, injects config, spawns claude-agent.js
   * via startProcess (fire-and-forget, returns immediately).
   */
  private async dispatchContainer(
    executionId: string,
    sessionId: string,
    prompt: string
  ): Promise<void> {
    const sandboxManager = new SandboxManager(
      this.env.SANDBOX_CONTAINER,
      this.env.SESSIONS_KV,
      this.env.FILES_BUCKET
    );

    const userId =
      (await this.ctx.storage.get<string>('userId')) || '';
    const sdkSessionId =
      (await this.ctx.storage.get<string>('sdkSessionId')) || '';

    // Assemble sandbox config from KV
    const config = await assembleSandboxConfig(
      this.env.SESSIONS_KV,
      userId
    );

    // Wake sandbox + inject MCP config
    const session = await sandboxManager.getOrWakeSandbox(
      sessionId,
      config
    );
    if (!session?.sandboxId) {
      throw new Error('Sandbox failed to wake');
    }

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
    const oauthToken =
      (await this.env.AUTH_KV.get(`user:${userId}:token`)) || '';

    // Get sandbox instance for startProcess
    const sandbox = getSandbox(
      this.env.SANDBOX_CONTAINER,
      session.sandboxId
    );

    // Write prompt to context file (same pattern as current flow)
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
    await sandbox.startProcess(
      'node /opt/claude-agent/claude-agent.js',
      {
        cwd: '/workspace',
        env: {
          IS_SANDBOX: '1',
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          VF_CALLBACK_URL: 'https://vaporforge.dev/internal/stream',
          VF_STREAM_JWT: token,
          VF_SDK_SESSION_ID: sdkSessionId,
          VF_SESSION_MODE: 'agent',
          NODE_PATH: '/opt/claude-agent/node_modules',
          CLAUDE_CONFIG_DIR: '/root/.config/claude',
          ...projectSecrets,
          ...userSecrets,
        },
      }
    );
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
