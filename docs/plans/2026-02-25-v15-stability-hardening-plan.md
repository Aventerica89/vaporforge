# VaporForge V1.5 Stability Hardening — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate VaporForge from direct WS proxy (Browser -> Worker -> Container) to a Durable Object architecture with automatic stream persistence, crash recovery, and walk-away-and-come-back capability.

**Architecture:** ChatSessionAgent DO (extending AIChatAgent) terminates the browser WebSocket, dispatches claude-agent.js in the container via `startProcess()`, and receives streaming output via a JWT-secured chunked HTTP POST from the container back to the Worker/DO. ResumableStream handles reconnection and replay automatically.

**Tech Stack:** Cloudflare Workers, Durable Objects (AIChatAgent from @cloudflare/agents), @cloudflare/sandbox, Web Crypto API (HS256 JWT), Vercel AI SDK (createUIMessageStream), React (useAgentChat)

---

## Phase 1: Infrastructure (Tasks 1-5)

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @cloudflare/agents and ai packages**

```bash
cd /Users/jb/vaporforge && npm install @cloudflare/agents ai
```

Verify `@cloudflare/agents` and `ai` appear in `package.json` dependencies.

**Step 2: Verify imports resolve**

```bash
cd /Users/jb/vaporforge && node -e "require.resolve('@cloudflare/agents')" && echo "OK"
```

Expected: prints path + OK

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @cloudflare/agents and ai SDK for V1.5 DO migration"
```

---

### Task 2: Create JWT Utility — Tests First

**Files:**
- Create: `src/utils/jwt.ts`
- Create: `src/utils/jwt.test.ts`

**Step 1: Write the failing tests**

Create `src/utils/jwt.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { signExecutionToken, verifyExecutionToken } from './jwt';

// Generate a test secret using Web Crypto
let testSecret: string;

beforeAll(async () => {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  testSecret = btoa(String.fromCharCode(...key));
});

describe('signExecutionToken', () => {
  it('produces a 3-part JWT string', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    expect(token.split('.')).toHaveLength(3);
  });

  it('embeds executionId and sessionId in payload', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const payload = JSON.parse(atob(token.split('.')[1]));
    expect(payload.executionId).toBe('exec-1');
    expect(payload.sessionId).toBe('session-1');
  });

  it('sets exp claim ~5 minutes in the future', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const after = Math.floor(Date.now() / 1000);
    const payload = JSON.parse(atob(token.split('.')[1]));
    // 5 minutes = 300 seconds, allow 2s tolerance
    expect(payload.exp).toBeGreaterThanOrEqual(before + 298);
    expect(payload.exp).toBeLessThanOrEqual(after + 302);
  });
});

describe('verifyExecutionToken', () => {
  it('returns payload for a valid token', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const result = await verifyExecutionToken(token, testSecret);
    expect(result).not.toBeNull();
    expect(result!.executionId).toBe('exec-1');
    expect(result!.sessionId).toBe('session-1');
  });

  it('returns null for a tampered payload', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const parts = token.split('.');
    // Tamper with payload
    const payload = JSON.parse(atob(parts[1]));
    payload.sessionId = 'hacked-session';
    parts[1] = btoa(JSON.stringify(payload));
    const tampered = parts.join('.');
    const result = await verifyExecutionToken(tampered, testSecret);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', async () => {
    // Create token with -10 minute TTL (already expired)
    const token = await signExecutionToken(
      'exec-1', 'session-1', testSecret, -600
    );
    const result = await verifyExecutionToken(token, testSecret);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signExecutionToken('exec-1', 'session-1', testSecret);
    const result = await verifyExecutionToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('returns null for malformed tokens', async () => {
    expect(await verifyExecutionToken('not.a.jwt', testSecret)).toBeNull();
    expect(await verifyExecutionToken('', testSecret)).toBeNull();
    expect(await verifyExecutionToken('abc', testSecret)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/jb/vaporforge && npx vitest run src/utils/jwt.test.ts
```

Expected: FAIL — module `./jwt` not found

**Step 3: Write minimal implementation**

Create `src/utils/jwt.ts`:

```typescript
// HS256 JWT utilities using Web Crypto API.
// Used to authenticate container-to-DO streaming POST requests.
// DO signs tokens, Worker + DO verify them.

export interface ExecutionTokenPayload {
  executionId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };
const DEFAULT_TTL_SECONDS = 300; // 5 minutes

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, ALGORITHM, false, [
    'sign',
    'verify',
  ]);
}

export async function signExecutionToken(
  executionId: string,
  sessionId: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: ExecutionTokenPayload = {
    executionId,
    sessionId,
    iat: now,
    exp: now + ttlSeconds,
  };

  const headerB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyExecutionToken(
  token: string,
  secret: string
): Promise<ExecutionTokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await importKey(secret);
    const signature = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;

    const payload: ExecutionTokenPayload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    );

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/jb/vaporforge && npx vitest run src/utils/jwt.test.ts
```

Expected: all 8 tests PASS

**Step 5: Commit**

```bash
git add src/utils/jwt.ts src/utils/jwt.test.ts
git commit -m "feat: add HS256 JWT utilities for container-to-DO auth"
```

---

### Task 3: Add ChatSessionAgent Durable Object Binding

**Files:**
- Modify: `wrangler.jsonc`

**Step 1: Add CHAT_SESSIONS binding to durable_objects.bindings**

In `wrangler.jsonc`, add a third binding to the `durable_objects.bindings` array:

```jsonc
{
  "name": "CHAT_SESSIONS",
  "class_name": "ChatSessionAgent"
}
```

**Step 2: Add migration tag v4 for ChatSessionAgent**

Add to the `migrations` array:

```jsonc
{
  "tag": "v4",
  "new_sqlite_classes": ["ChatSessionAgent"]
}
```

**Step 3: Also add to preview env**

Add the binding to `env.preview.durable_objects.bindings`:

```jsonc
{
  "name": "CHAT_SESSIONS",
  "class_name": "ChatSessionAgent",
  "script_name": "vaporforge"
}
```

**Step 4: Verify wrangler.jsonc is valid**

```bash
cd /Users/jb/vaporforge && npx wrangler types 2>&1 | head -5
```

Expected: no JSON parse errors

**Step 5: Commit**

```bash
git add wrangler.jsonc
git commit -m "chore: add ChatSessionAgent DO binding and v4 SQLite migration"
```

---

### Task 4: Update Env Type

**Files:**
- Modify: `worker-configuration.d.ts`

**Step 1: Add CHAT_SESSIONS binding**

Add after the existing `SESSIONS` binding:

```typescript
// Chat Session Agent (AIChatAgent) for V1.5 stream persistence
CHAT_SESSIONS: DurableObjectNamespace;
```

**Step 2: Verify typecheck**

```bash
cd /Users/jb/vaporforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors related to CHAT_SESSIONS

**Step 3: Commit**

```bash
git add worker-configuration.d.ts
git commit -m "chore: add CHAT_SESSIONS to Env type definition"
```

---

### Task 5: Verify Infrastructure Baseline

**Step 1: Run full test suite**

```bash
cd /Users/jb/vaporforge && npm test 2>&1 | tail -20
```

Expected: all tests pass including new JWT tests

**Step 2: Run typecheck**

```bash
cd /Users/jb/vaporforge && npx tsc --noEmit
```

Expected: no errors (ChatSessionAgent class not imported yet, so binding is just a type)

**Step 3: Commit if any fixes needed**

Only commit if Step 1 or 2 revealed issues that needed fixing.

---

## Phase 2: ChatSessionAgent Durable Object (Tasks 6-7)

### Task 6: Create ChatSessionAgent — Core Class

**Files:**
- Create: `src/agents/chat-session-agent.ts`

This is the core DO that replaces the direct WS proxy. It:
1. Extends AIChatAgent for ResumableStream + SQLite persistence
2. Intercepts `/internal/stream` POST from container in `fetch()`
3. Bridges container output to ResumableStream via TransformStream
4. Dispatches container via `startProcess()` (fire-and-forget)

**Step 1: Create the file**

Create `src/agents/chat-session-agent.ts`:

```typescript
import { AIChatAgent } from '@cloudflare/agents/ai-chat';
import { createUIMessageStreamResponse } from 'ai';
import {
  signExecutionToken,
  verifyExecutionToken,
} from '../utils/jwt';
import type { ExecutionTokenPayload } from '../utils/jwt';
import { SandboxManager } from '../sandbox';
import {
  assembleSandboxConfig,
  collectProjectSecrets,
  collectUserSecrets,
} from '../config-assembly';
import { getSandbox } from '@cloudflare/sandbox';

// In-memory map of active streams, keyed by executionId.
// Safe from hibernation because createUIMessageStream's
// reader.read() loop holds an unresolved Promise = pending I/O.
type StreamWriter = WritableStreamDefaultWriter<Uint8Array>;

interface ActiveStream {
  writer: StreamWriter;
  createdAt: number;
}

export class ChatSessionAgent extends AIChatAgent<Env> {
  private activeStreams = new Map<string, ActiveStream>();

  // Intercept /internal/stream POST from container,
  // delegate everything else to AIChatAgent (WS upgrades, RPC, etc.)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (
      request.method === 'POST' &&
      url.pathname === '/internal/stream'
    ) {
      return this.handleContainerStream(request);
    }

    // AIChatAgent handles WS upgrades, @callable() RPC, etc.
    return super.fetch(request);
  }

  // Called by AIChatAgent when client sends a chat message via WS.
  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>['onChatMessage']>[0],
    options?: Parameters<AIChatAgent<Env>['onChatMessage']>[1]
  ) {
    const executionId = crypto.randomUUID();
    const sessionId = this.name; // DO name = session ID

    // Create TransformStream bridge: writer goes in Map,
    // readable feeds createUIMessageStreamResponse.
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    this.activeStreams.set(executionId, {
      writer,
      createdAt: Date.now(),
    });

    // Get the latest user message
    const latestMessage = this.messages[this.messages.length - 1];
    const prompt =
      typeof latestMessage?.content === 'string'
        ? latestMessage.content
        : '';

    // Fire-and-forget: dispatch container.
    // DO stays alive because readable's reader loop is pending I/O.
    this.dispatchContainer(executionId, sessionId, prompt).catch(
      (err) => {
        console.error(
          '[ChatSessionAgent] Container dispatch failed:',
          err
        );
        const errorChunk = new TextEncoder().encode(
          JSON.stringify({ type: 'error', error: String(err) }) +
            '\n'
        );
        writer.write(errorChunk).catch(() => {});
        writer.close().catch(() => {});
        this.activeStreams.delete(executionId);
      }
    );

    // Return streaming response.
    // createUIMessageStreamResponse wraps the readable into
    // ResumableStream, which auto-persists to SQLite.
    return createUIMessageStreamResponse({
      status: 200,
      body: readable,
    });
  }

  // Receives chunked POST from container, pipes into TransformStream.
  private async handleContainerStream(
    request: Request
  ): Promise<Response> {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    // Validate JWT (signature + expiry)
    const payload = await verifyExecutionToken(
      token,
      this.env.JWT_SECRET
    );
    if (!payload) {
      return new Response('Unauthorized', { status: 401 });
    }

    const stream = this.activeStreams.get(payload.executionId);
    if (!stream) {
      return new Response('No active stream for this execution', {
        status: 404,
      });
    }

    // Pipe request.body (chunked POST) into the TransformStream writer.
    if (!request.body) {
      stream.writer.close().catch(() => {});
      this.activeStreams.delete(payload.executionId);
      return new Response('OK', { status: 200 });
    }

    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await stream.writer.write(value);
      }
      // Container finished — close the stream
      await stream.writer.close();
    } catch (err) {
      console.error(
        '[ChatSessionAgent] Stream pipe error:',
        err
      );
      stream.writer.abort(err).catch(() => {});
    } finally {
      this.activeStreams.delete(payload.executionId);
    }

    return new Response('OK', { status: 200 });
  }

  // Wakes container, injects config, spawns claude-agent.js
  // via startProcess() (returns immediately, fire-and-forget).
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

    // Assemble sandbox config from KV (MCP, secrets, plugins, etc.)
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

    // Collect env vars for the container process
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
    // startProcess returns immediately — the process runs in background.
    // claude-agent.js reads prompt from context file and streams
    // output via chunked POST to VF_CALLBACK_URL.
    await sandbox.startProcess(
      'node /opt/claude-agent/claude-agent.js',
      {
        cwd: '/workspace',
        env: {
          ...process.env,
          IS_SANDBOX: '1',
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          VF_CALLBACK_URL:
            'https://vaporforge.dev/internal/stream',
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
```

**Step 2: Export ChatSessionAgent from index.ts**

Add to `src/index.ts` near the top exports:

```typescript
export { ChatSessionAgent } from './agents/chat-session-agent';
```

**Step 3: Verify typecheck**

```bash
cd /Users/jb/vaporforge && npx tsc --noEmit 2>&1 | head -30
```

Address any type errors. Common issues:
- AIChatAgent generic type parameter
- `this.name` vs `this.id` for DO identity
- Import paths for sandbox utilities

**Step 4: Commit**

```bash
git add src/agents/chat-session-agent.ts src/index.ts
git commit -m "feat: add ChatSessionAgent DO extending AIChatAgent"
```

---

### Task 7: Add Session Initialization Route

**Files:**
- Modify: `src/api/sessions.ts` (or wherever session creation happens)

When a new session is created, the ChatSessionAgent DO needs to be initialized with `userId` so `dispatchContainer` can retrieve the OAuth token.

**Step 1: Find session creation code**

Read `src/api/sessions.ts` and locate where `SESSIONS_KV.put('session:...')` happens.

**Step 2: After session creation, initialize the ChatSessionAgent**

```typescript
// After creating the session in KV, initialize the ChatSessionAgent DO
const chatId = env.CHAT_SESSIONS.idFromName(sessionId);
const chatStub = env.CHAT_SESSIONS.get(chatId);
// Store userId in DO storage for later use by dispatchContainer
await chatStub.fetch(
  new Request('https://internal/init', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id }),
  })
);
```

**Step 3: Handle /init in ChatSessionAgent.fetch()**

Add to `chat-session-agent.ts` fetch method:

```typescript
if (request.method === 'POST' && url.pathname === '/init') {
  const body = await request.json() as { userId: string };
  await this.ctx.storage.put('userId', body.userId);
  return new Response('OK', { status: 200 });
}
```

**Step 4: Commit**

```bash
git add src/agents/chat-session-agent.ts src/api/sessions.ts
git commit -m "feat: initialize ChatSessionAgent with userId on session create"
```

---

## Phase 3: Worker Routing (Tasks 8-9)

### Task 8: Route /internal/stream to ChatSessionAgent

**Files:**
- Modify: `src/index.ts`

The container POSTs to `https://vaporforge.dev/internal/stream` with a JWT Bearer token. The Worker must intercept this, validate the JWT, extract `sessionId`, and route to the correct ChatSessionAgent DO.

**Step 1: Add routing before the Hono router**

In `src/index.ts`, add after the `proxyToSandbox` check but before the WebSocket upgrade check:

```typescript
// V1.5: Route container streaming POST to ChatSessionAgent DO
if (
  request.method === 'POST' &&
  new URL(request.url).pathname === '/internal/stream'
) {
  const { verifyExecutionToken } = await import('./utils/jwt');
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  // Validate JWT in Worker BEFORE routing to DO
  // (prevents attackers from waking arbitrary DO instances)
  const payload = await verifyExecutionToken(
    token,
    env.JWT_SECRET
  );
  if (!payload) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Route to the correct ChatSessionAgent DO
  const id = env.CHAT_SESSIONS.idFromName(payload.sessionId);
  const stub = env.CHAT_SESSIONS.get(id);
  return stub.fetch(request);
}
```

**Step 2: Verify no conflicts with existing routes**

Check that `/internal/stream` doesn't conflict with any Hono routes in `src/router.ts`.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: route /internal/stream POST to ChatSessionAgent with JWT validation"
```

---

### Task 9: Test Worker Routing

**Files:**
- Create: `src/routes/internal-stream.test.ts` (or add to existing test file)

**Step 1: Write integration test**

Test that:
- POST to `/internal/stream` without JWT returns 401
- POST with invalid JWT returns 401
- POST with valid JWT routes to DO (mock DO namespace)

**Step 2: Run tests**

```bash
cd /Users/jb/vaporforge && npx vitest run src/routes/internal-stream.test.ts
```

**Step 3: Commit**

```bash
git add src/routes/
git commit -m "test: add /internal/stream routing tests"
```

---

## Phase 4: Container Client (Tasks 10-12)

### Task 10: Modify claude-agent.js — Streaming POST Output

**Files:**
- Modify: `src/sandbox-scripts/claude-agent.js`

Replace the `emit()` function that writes to stdout with a streaming POST to the DO callback URL. Fall back to stdout if `VF_CALLBACK_URL` is not set (backwards compatibility with ws-agent-server.js).

**Step 1: Add streaming POST client at the top of claude-agent.js**

After the existing `emit()` function (line ~31), add the callback streaming infrastructure:

```javascript
const http = require('http');
const https = require('https');

// Streaming POST to DO callback (V1.5 path).
// Opens one long-lived chunked POST and writes JSON lines into it.
let callbackRequest = null;
let useCallbackStream = false;

function initCallbackStream() {
  const callbackUrl = process.env.VF_CALLBACK_URL;
  const jwt = process.env.VF_STREAM_JWT;
  if (!callbackUrl || !jwt) return;

  useCallbackStream = true;
  const url = new URL(callbackUrl);
  const transport = url.protocol === 'https:' ? https : http;

  callbackRequest = transport.request(
    {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        Authorization: `Bearer ${jwt}`,
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        console.error(
          `[claude-agent] Callback POST failed: ${res.statusCode}`
        );
        // Fall back to stdout
        useCallbackStream = false;
      }
    }
  );

  callbackRequest.on('error', (err) => {
    console.error('[claude-agent] Callback connection error:', err.message);
    useCallbackStream = false;
  });
}

// Replace emit() to route through callback stream when available
const originalEmit = emit;
emit = function (obj) {
  const line = JSON.stringify(obj) + '\n';
  if (useCallbackStream && callbackRequest) {
    callbackRequest.write(line);
  }
  // Always write to stdout too (for ws-agent-server.js compatibility)
  originalEmit(obj);
};

function closeCallbackStream() {
  if (callbackRequest) {
    callbackRequest.end();
    callbackRequest = null;
  }
}
```

**Step 2: Call initCallbackStream() at startup**

Near the bottom of claude-agent.js, before `handleQuery()` is called (~line 630):

```javascript
initCallbackStream();
```

**Step 3: Call closeCallbackStream() on completion**

In the `done` handler and error handler, after the final emit:

```javascript
closeCallbackStream();
```

**Step 4: Read sdkSessionId from env**

In `handleQuery()`, check for `VF_SDK_SESSION_ID` env var:

```javascript
const sdkSessionIdFromEnv = process.env.VF_SDK_SESSION_ID;
if (sdkSessionIdFromEnv) {
  // Use DO-provided sdkSessionId for resume
  sessionId = sdkSessionIdFromEnv;
  useResume = true;
}
```

**Step 5: Verify backwards compatibility**

When `VF_CALLBACK_URL` is NOT set:
- `useCallbackStream` stays false
- `emit()` writes only to stdout (same as before)
- ws-agent-server.js flow works unchanged

**Step 6: Commit**

```bash
git add src/sandbox-scripts/claude-agent.js
git commit -m "feat: add streaming POST callback to claude-agent.js for V1.5 DO path"
```

---

### Task 11: Update Dockerfile with Modified claude-agent.js

**Files:**
- Modify: `Dockerfile`

**Step 1: Sync Dockerfile heredoc with src/sandbox-scripts/claude-agent.js**

The Dockerfile copies claude-agent.js into the container image. Update the heredoc or COPY instruction to include the new streaming POST code.

**Step 2: Bump VF_CONTAINER_BUILD**

Increment the `VF_CONTAINER_BUILD` env var in the Dockerfile to bust the cache:

```dockerfile
ENV VF_CONTAINER_BUILD=15
```

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore: sync Dockerfile with streaming POST claude-agent.js"
```

---

### Task 12: Verify Container Builds

**Step 1: Prune Docker cache**

```bash
docker image prune -a -f && docker builder prune -a -f
```

**Step 2: Build locally**

```bash
cd /Users/jb/vaporforge && docker build -t vaporforge-test .
```

Expected: builds successfully

**Step 3: Spot-check claude-agent.js in image**

```bash
docker run --rm vaporforge-test cat /opt/claude-agent/claude-agent.js | head -50
```

Expected: shows the new streaming POST code

---

## Phase 5: Frontend Integration (Tasks 13-16)

### Task 13: Install useAgentChat Client SDK

**Files:**
- Modify: `ui/package.json`

**Step 1: Install agents-sdk client**

```bash
cd /Users/jb/vaporforge/ui && npm install agents-sdk
```

(The `agents-sdk` package provides `useAgentChat` React hook for connecting to AIChatAgent DOs.)

**Step 2: Commit**

```bash
git add ui/package.json ui/package-lock.json
git commit -m "chore: install agents-sdk for useAgentChat client hook"
```

---

### Task 14: Create useAgentSession Adapter Hook

**Files:**
- Create: `ui/src/hooks/useAgentSession.ts`

This hook wraps `useAgentChat` and maps its API to the existing VaporForge message interface. This allows ChatPanel to switch between old WS path and new DO path via a feature flag.

**Step 1: Create the adapter hook**

```typescript
import { useAgentChat } from 'agents-sdk/react';
import { useCallback, useMemo } from 'react';

interface VFMessage {
  role: 'user' | 'assistant';
  content: string;
  parts?: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

interface UseAgentSessionOptions {
  sessionId: string;
  enabled: boolean;
}

interface UseAgentSessionReturn {
  messages: VFMessage[];
  isStreaming: boolean;
  sendMessage: (prompt: string) => void;
  clearMessages: () => void;
}

export function useAgentSession({
  sessionId,
  enabled,
}: UseAgentSessionOptions): UseAgentSessionReturn | null {
  // useAgentChat connects to the ChatSessionAgent DO via WebSocket.
  // resume: true is the default — handles reconnection automatically.
  const agent = useAgentChat({
    agent: 'chat-session-agent',
    name: sessionId,
  });

  if (!enabled) return null;

  // Map AI SDK UIMessage[] to VF's message format
  const messages: VFMessage[] = useMemo(
    () =>
      (agent.messages || []).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : '',
        parts: msg.parts?.map((p) => ({
          type: p.type,
          text: 'text' in p ? String(p.text) : undefined,
        })),
      })),
    [agent.messages]
  );

  const sendMessage = useCallback(
    (prompt: string) => {
      agent.sendMessage(prompt);
    },
    [agent]
  );

  const clearMessages = useCallback(() => {
    agent.clearMessages();
  }, [agent]);

  return {
    messages,
    isStreaming: agent.isLoading,
    sendMessage,
    clearMessages,
  };
}
```

**Step 2: Commit**

```bash
git add ui/src/hooks/useAgentSession.ts
git commit -m "feat: add useAgentSession adapter hook for ChatSessionAgent"
```

---

### Task 15: Add Feature Flag to ChatPanel

**Files:**
- Modify: `ui/src/components/ChatPanel.tsx`

**Step 1: Add feature flag constant**

At the top of ChatPanel.tsx:

```typescript
// V1.5: Set to true to use ChatSessionAgent DO path
// instead of direct WS proxy. Toggle for incremental rollout.
const USE_AGENT_CHAT = false;
```

**Step 2: Import useAgentSession**

```typescript
import { useAgentSession } from '../hooks/useAgentSession';
```

**Step 3: Wire up conditionally**

Inside the component, add:

```typescript
const agentSession = useAgentSession({
  sessionId: currentSession?.id || '',
  enabled: USE_AGENT_CHAT,
});

// Use agent session messages/streaming when enabled,
// fall back to existing WS hook otherwise.
const effectiveMessages = agentSession
  ? agentSession.messages
  : existingMessages;
const effectiveIsStreaming = agentSession
  ? agentSession.isStreaming
  : existingIsStreaming;
```

**Step 4: Do NOT enable yet**

Leave `USE_AGENT_CHAT = false`. This task just wires up the plumbing. Task 18 tests it end-to-end before flipping.

**Step 5: Commit**

```bash
git add ui/src/components/ChatPanel.tsx
git commit -m "feat: wire useAgentSession into ChatPanel behind feature flag"
```

---

### Task 16: Verify Frontend Build

**Step 1: Build UI**

```bash
cd /Users/jb/vaporforge && npm run build
```

Expected: builds successfully with no errors

**Step 2: Typecheck**

```bash
cd /Users/jb/vaporforge && npx tsc --noEmit
```

Expected: no new type errors

**Step 3: Commit if any fixes needed**

---

## Phase 6: Session State Management (Task 17)

### Task 17: Store sdkSessionId in DO on Stream Completion

**Files:**
- Modify: `src/agents/chat-session-agent.ts`

When the container stream completes (container POST ends), the DO should extract `sdkSessionId` from the final `done` event and persist it for the next invocation.

**Step 1: Parse sdkSessionId from stream chunks**

In `handleContainerStream`, as chunks flow through, look for the `done` event:

```typescript
// After piping chunks, parse last chunk for sdkSessionId
// The container emits: { type: "done", sessionId: "...", ... }
// We need to intercept this and store sessionId in DO storage
```

Create a helper that scans NDJSON chunks for `done` events:

```typescript
private extractSdkSessionId(chunk: Uint8Array): string | null {
  try {
    const text = new TextDecoder().decode(chunk);
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'done' && event.sessionId) {
        return event.sessionId;
      }
    }
  } catch {
    // Chunk may span JSON boundaries; that's OK
  }
  return null;
}
```

**Step 2: Call it in the pipe loop**

In `handleContainerStream`, inside the while loop:

```typescript
const sid = this.extractSdkSessionId(value);
if (sid) {
  await this.ctx.storage.put('sdkSessionId', sid);
}
```

**Step 3: Commit**

```bash
git add src/agents/chat-session-agent.ts
git commit -m "feat: persist sdkSessionId from container stream for session continuity"
```

---

## Phase 7: Integration Testing + Deploy (Tasks 18-19)

### Task 18: End-to-End Smoke Test

**Step 1: Enable feature flag locally**

Set `USE_AGENT_CHAT = true` in ChatPanel.tsx (local only, don't commit).

**Step 2: Deploy to preview**

```bash
cd /Users/jb/vaporforge && npx wrangler deploy --env preview
```

**Step 3: Test the new flow**

1. Open VaporForge in browser
2. Create a new session
3. Send a simple message ("say hello")
4. Verify: message streams through ChatSessionAgent DO
5. Disconnect (close tab)
6. Reopen — verify message history persists (ResumableStream replay)

**Step 4: Test backwards compatibility**

1. Set `USE_AGENT_CHAT = false`
2. Rebuild and deploy preview
3. Verify old WS path still works

**Step 5: Document any issues**

---

### Task 19: Production Deploy

**Step 1: Set feature flag**

Decide: `USE_AGENT_CHAT = true` (full cutover) or `false` (ship code, enable later).

**Step 2: Full build**

```bash
cd /Users/jb/vaporforge && npm run build
```

**Step 3: Deploy**

```bash
cd /Users/jb/vaporforge && npx wrangler deploy
```

**Step 4: Verify production**

1. Open https://vaporforge.dev
2. Test basic chat flow
3. Test reconnection (refresh during generation)

**Step 5: Update version**

Bump version in `ui/src/lib/version.ts` and `CHANGELOG-DEV.md` per VaporForge CLAUDE.md rules.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: V1.5 stability hardening — DO stream persistence"
```

---

## Post-Migration Cleanup (Future, not part of V1.5)

After analytics confirm 100% of traffic uses the new DO path:

- [ ] Delete `src/sandbox-scripts/ws-agent-server.js`
- [ ] Remove `handleSdkWs` from `src/api/sdk.ts`
- [ ] Remove `/api/sdk/ws` route from router
- [ ] Remove `startWsServer()` from `src/sandbox.ts`
- [ ] Remove `wsConnectToSandbox()` from `src/sandbox.ts`
- [ ] Remove `USE_AGENT_CHAT` feature flag
- [ ] Remove `/api/sdk/persist` endpoint (DO persists automatically)
- [ ] Remove `/api/sdk/replay` endpoint (ResumableStream replaces it)
- [ ] Simplify claude-agent.js (remove stdout emit, keep only callback stream)

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AIChatAgent API changes | Low | High | Pin @cloudflare/agents version |
| startProcess() behavior differs from docs | Medium | High | Test in preview env first, fall back to nohup pattern |
| JWT clock skew between container and DO | Low | Medium | 5-min TTL gives generous margin |
| Container can't reach vaporforge.dev | Medium | High | enableInternet: true; verify DNS in container |
| Concurrent messages interleave streams | Medium | High | Add active-stream semaphore in onChatMessage |
| Container crash leaves stream hanging | Medium | Medium | Add timeout + container.monitor() watchdog |
| Frontend useAgentChat incompatible | Low | Medium | Feature flag allows instant rollback |

## Key Research Sources

- `~/.claude/projects/-Users-jb/memory/vaporforge-v15-research.md` — full research notes
- `~/Obsidian-Claude/plans/2026-02-25-vaporforge-v15-research-synthesis.md` — architecture decisions
- `~/research/responses/gemini-05-mega-followup.md` — gap fills (dispatchContainer, sdkSessionId, backwards compat)
- Cloudflare Sandbox API: `sandbox.startProcess()` for long-running background processes
- Cloudflare Agents SDK: `AIChatAgent`, `createUIMessageStreamResponse`, `useAgentChat`
