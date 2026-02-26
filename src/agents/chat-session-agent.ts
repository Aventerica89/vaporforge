/**
 * ChatSessionAgent — Durable Object extending AIChatAgent.
 *
 * Replaces the direct WS proxy (Browser -> Worker -> Container) with a
 * DO-mediated architecture that provides:
 * - Automatic stream persistence via ResumableStream (SQLite-backed)
 * - Crash recovery (container can restart, DO keeps buffered chunks)
 * - Walk-away-and-come-back (reconnecting clients get replayed chunks)
 *
 * Data flow:
 * 1. Client sends chat message via WS -> onChatMessage fires
 * 2. DO creates bridge (writer stored in Map, keyed by executionId)
 * 3. DO dispatches container (fire-and-forget via startProcess)
 * 4. Returns createUIMessageStreamResponse wrapping createUIMessageStream
 * 5. Container boots, runs claude-agent.js
 * 6. claude-agent.js opens chunked POST to /internal/stream
 * 7. Worker validates JWT, routes to this DO
 * 8. onRequest intercepts, pipes NDJSON -> UIMessageChunk via writer
 * 9. Container finishes -> POST ends -> writer closes -> stream finalizes
 */
import { AIChatAgent } from '@cloudflare/agents/ai-chat-agent';
import type { AgentContext } from '@cloudflare/agents';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { StreamTextOnFinishCallback } from 'ai';
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

interface StreamBridge {
  // Writer from createUIMessageStream's execute callback
  writer: {
    write(part: Record<string, unknown>): void;
  };
  // Resolves when container stream completes
  resolve: () => void;
  reject: (err: Error) => void;
  // Track whether we've sent the initial text-start
  textStarted: boolean;
  textPartId: string;
}

/** HTTP passthrough bridge — forwards container NDJSON to browser as-is. */
interface HttpBridge {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class ChatSessionAgent extends AIChatAgent<Env> {
  private bridges = new Map<string, StreamBridge>();
  private httpBridges = new Map<string, HttpBridge>();

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
  }

  /**
   * HTTP request handler. Intercepts:
   * - POST /internal/stream — container callback with chunked NDJSON
   * - POST /init — session initialization with userId
   * Everything else delegates to AIChatAgent (WS upgrades, RPC, etc.)
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

    return super.onRequest(request);
  }

  /**
   * Called by AIChatAgent when client sends a chat message via WS.
   * Returns a streaming Response that feeds ResumableStream.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<any>
  ): Promise<Response> {
    const executionId = crypto.randomUUID();
    const sessionId = this.name;

    // Get the latest user message content
    const latestMessage = this.messages[this.messages.length - 1];
    const prompt =
      typeof latestMessage?.content === 'string'
        ? latestMessage.content
        : '';

    // Create a promise pair — execute() awaits, handleContainerStream resolves
    const { promise, resolve, reject } = createDeferred<void>();

    // Build the UIMessageStream with an execute callback that blocks
    // until the container stream completes.
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const bridge: StreamBridge = {
          writer: writer as { write(part: Record<string, unknown>): void },
          resolve,
          reject,
          textStarted: false,
          textPartId: crypto.randomUUID(),
        };

        this.bridges.set(executionId, bridge);

        // Fire-and-forget: dispatch container.
        // The pending `await promise` below keeps the execute callback
        // alive, which keeps the DO alive (pending I/O).
        this.dispatchContainer(executionId, sessionId, prompt).catch(
          (err) => {
            console.error(
              '[ChatSessionAgent] dispatch failed:',
              err
            );
            try {
              writer.write({
                type: 'error',
                errorText: String(err),
              });
            } catch { /* writer may be closed */ }
            this.bridges.delete(executionId);
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        );

        // Block until container stream completes or errors
        await promise;
      },
      originalMessages: this.messages,
    });

    return createUIMessageStreamResponse({ stream });
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
   * Receives chunked POST from container, parses NDJSON lines,
   * maps VF event format to UIMessageChunk, and writes to the bridge.
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

    // Check WS bridge first (AIChatAgent path)
    const bridge = this.bridges.get(payload.executionId);

    // Check HTTP bridge (V1.5 HTTP streaming path)
    const httpBridge = this.httpBridges.get(payload.executionId);

    if (!bridge && !httpBridge) {
      return new Response('No active stream for this execution', {
        status: 404,
      });
    }

    // Route to HTTP passthrough handler if using HTTP bridge
    if (httpBridge) {
      return this.handleContainerStreamHttp(
        request,
        httpBridge,
        payload
      );
    }

    // At this point bridge must be defined (guarded by !bridge && !httpBridge above)
    if (!bridge) {
      return new Response('No active stream', { status: 404 });
    }

    if (!request.body) {
      bridge.resolve();
      this.bridges.delete(payload.executionId);
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
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          this.processContainerEvent(line, bridge, payload.sessionId);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        this.processContainerEvent(buffer, bridge, payload.sessionId);
      }

      // Container POST ended cleanly — finalize
      if (bridge.textStarted) {
        bridge.writer.write({ type: 'text-end' });
      }
      bridge.writer.write({
        type: 'finish',
        finishReason: 'stop',
      });
      bridge.resolve();
    } catch (err) {
      console.error('[ChatSessionAgent] stream pipe error:', err);
      bridge.reject(
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      this.bridges.delete(payload.executionId);
    }

    return new Response('OK', { status: 200 });
  }

  /**
   * Map a single VF NDJSON event to UIMessageChunk writes.
   *
   * VF format:
   *   { type: "text-delta", text: "..." }
   *   { type: "tool-start", name: "...", input: {...} }
   *   { type: "tool-result", name: "...", output: "..." }
   *   { type: "done", sessionId: "..." }
   *   { type: "error", error: "..." }
   *
   * UIMessageChunk format:
   *   { type: "text-start", id: "..." }
   *   { type: "text-delta", delta: "..." }
   *   { type: "text-end" }
   *   { type: "finish", finishReason: "stop" }
   */
  private processContainerEvent(
    line: string,
    bridge: StreamBridge,
    sessionId: string
  ): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return; // Skip malformed lines
    }

    switch (event.type) {
      case 'text-delta': {
        if (!bridge.textStarted) {
          bridge.writer.write({
            type: 'text-start',
            id: bridge.textPartId,
          });
          bridge.textStarted = true;
        }
        bridge.writer.write({
          type: 'text-delta',
          delta: String(event.text || ''),
        });
        break;
      }

      case 'session-init': {
        // Store sdkSessionId for next invocation's resume
        if (event.sessionId) {
          this.ctx.storage
            .put('sdkSessionId', String(event.sessionId))
            .catch(() => {});
        }
        break;
      }

      case 'done': {
        // Persist sdkSessionId from done event (more authoritative)
        if (event.sessionId) {
          this.ctx.storage
            .put('sdkSessionId', String(event.sessionId))
            .catch(() => {});
        }
        // Text finalization happens in handleContainerStream after loop
        break;
      }

      case 'error': {
        bridge.writer.write({
          type: 'error',
          errorText: String(event.error || 'Unknown error'),
        });
        break;
      }

      case 'tool-start': {
        // End any open text part before tool
        if (bridge.textStarted) {
          bridge.writer.write({ type: 'text-end' });
          bridge.textStarted = false;
          bridge.textPartId = crypto.randomUUID();
        }
        bridge.writer.write({
          type: 'tool-call-start',
          toolCallId: String(event.toolCallId || crypto.randomUUID()),
          toolName: String(event.name || ''),
        });
        // Send input as tool-input if available
        if (event.input) {
          bridge.writer.write({
            type: 'tool-input-delta',
            toolCallId: String(event.toolCallId || ''),
            delta: JSON.stringify(event.input),
          });
        }
        break;
      }

      case 'tool-result': {
        bridge.writer.write({
          type: 'tool-result',
          toolCallId: String(event.toolCallId || ''),
          toolName: String(event.name || ''),
          result: String(event.output || ''),
        });
        break;
      }

      case 'reasoning-delta': {
        bridge.writer.write({
          type: 'reasoning',
          text: String(event.text || ''),
        });
        break;
      }

      default:
        // Unknown event types are silently skipped for now
        break;
    }
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

  /**
   * HTTP bridge version of handleContainerStream.
   * Pipes container NDJSON events through to the browser as-is.
   */
  private async handleContainerStreamHttp(
    request: Request,
    bridge: HttpBridge,
    payload: { executionId: string; sessionId: string }
  ): Promise<Response> {
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
          // Pipe container NDJSON through to browser
          await bridge.writer.write(
            bridge.encoder.encode(line + '\n')
          );
          // Extract metadata for DO storage
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
      bridge.reject(
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      this.httpBridges.delete(payload.executionId);
    }

    return new Response('OK', { status: 200 });
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
