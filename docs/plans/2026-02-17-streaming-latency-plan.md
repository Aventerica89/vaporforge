# Streaming Latency Optimization (Cortex) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce time-to-first-token from 8-10s (warm) / 45s (cold) to 1-2s (warm) / 15-20s (cold).

**Architecture:** Hash-based skip logic + parallel execution. Worker computes config hashes, passes them to container. Container tracks what it already has in `/tmp/vf-state.json`. Redundant npm installs, file writes, and process checks are skipped when hashes match. Independent operations run in parallel via `Promise.all()`.

**Tech Stack:** Cloudflare Workers (Hono), CF Sandbox SDK, Node.js (container scripts)

---

## Task 1: Config Hashing Utility

**Files:**
- Create: `src/lib/config-hash.ts`

**Step 1: Create the hashing module**

```typescript
// src/lib/config-hash.ts

/**
 * Compute a short hash of a config object for cache-busting.
 * Uses SubtleCrypto (available in Workers + Node 18+).
 */
export async function configHash(
  data: Record<string, unknown> | unknown[] | null | undefined
): Promise<string> {
  if (!data) return 'empty';
  const str = JSON.stringify(data);
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(hashBuf);
  // 8-char hex prefix is enough for cache-busting
  return Array.from(arr.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**Step 2: Verify it works**

Run: `npm run typecheck`
Expected: No type errors for the new file.

**Step 3: Commit**

```bash
git add src/lib/config-hash.ts
git commit -m "feat: add config hashing utility for Cortex skip logic"
```

---

## Task 2: Hash-Aware Skip Logic in sandbox.ts

**Files:**
- Modify: `src/sandbox.ts` (refreshMcpConfig, startWsServer)

**Step 1: Add hash parameters to refreshMcpConfig**

Modify `refreshMcpConfig()` signature to accept optional hashes. When provided, compare with container state file before doing work.

In `src/sandbox.ts`, update `refreshMcpConfig`:

```typescript
async refreshMcpConfig(
  sessionId: string,
  config: SandboxConfig,
  hashes?: { mcpConfigHash: string; credFilesHash: string }
): Promise<void> {
  const sandbox = this.getSandboxInstance(sessionId);
  const sid = sessionId.slice(0, 8);

  // Read container state to check if work can be skipped
  let containerState: Record<string, string> = {};
  if (hashes) {
    try {
      const stateResult = await sandbox.exec(
        'cat /tmp/vf-state.json 2>/dev/null || echo "{}"',
        { timeout: 3000 }
      );
      containerState = JSON.parse(stateResult.stdout?.trim() || '{}');
    } catch {
      // First message or corrupted state — will do full refresh
    }
  }

  // --- MCP config write (skip if hash matches) ---
  const mergedMcp: Record<string, Record<string, unknown>> = {
    ...(config.mcpServers || {}),
    ...(config.pluginConfigs?.mcpServers || {}),
    ...(config.geminiMcpServers || {}),
  };

  const skipMcpWrite =
    hashes && containerState.mcpConfigHash === hashes.mcpConfigHash;

  if (!skipMcpWrite && Object.keys(mergedMcp).length > 0) {
    await sandbox.writeFile(
      '/root/.claude.json',
      JSON.stringify({ mcpServers: mergedMcp }, null, 2)
    );
  } else if (skipMcpWrite) {
    console.log(`[refreshMcpConfig] ${sid}: MCP config unchanged, skipping write`);
  }

  // --- npm install (skip if hash matches — packages already installed) ---
  if (!skipMcpWrite) {
    const npxPackages: string[] = [];
    for (const [name, cfg] of Object.entries(mergedMcp)) {
      const c = cfg as Record<string, unknown>;
      if (c.command === 'npx' && Array.isArray(c.args) && c.args.length > 0) {
        const args = c.args as string[];
        const pkg = args.find((a: string) => !a.startsWith('-'));
        if (pkg) {
          npxPackages.push(pkg);
          console.log(
            `[refreshMcpConfig] ${sid}: will pre-install npx package "${pkg}" for server "${name}"`
          );
        }
      }
    }
    if (npxPackages.length > 0) {
      const installCmd =
        `npm install -g ${npxPackages.join(' ')} --prefer-offline 2>&1 || true`;
      try {
        const result = await sandbox.exec(installCmd, { timeout: 60_000 });
        const output = (result.stdout || '').trim();
        if (output) {
          const lines = output.split('\n');
          const tail = lines.slice(-3).join(' | ');
          console.log(`[refreshMcpConfig] ${sid}: npm install result: ${tail}`);
        }
      } catch (err) {
        console.warn(
          `[refreshMcpConfig] ${sid}: npx pre-install failed (non-fatal): ${err}`
        );
      }
    }
  } else {
    console.log(`[refreshMcpConfig] ${sid}: npm packages unchanged, skipping install`);
  }

  // --- Credential files (skip if hash matches) ---
  const skipCredWrite =
    hashes && containerState.credFilesHash === hashes.credFilesHash;

  if (!skipCredWrite && config.credentialFiles && config.credentialFiles.length > 0) {
    for (const cred of config.credentialFiles) {
      const parentDir = cred.path.substring(0, cred.path.lastIndexOf('/'));
      if (parentDir) {
        await sandbox.mkdir(parentDir, { recursive: true });
      }
      await sandbox.writeFile(cred.path, cred.content);
    }
    console.log(
      `[refreshMcpConfig] ${sid}: refreshed ${config.credentialFiles.length} credential files`
    );
  } else if (skipCredWrite) {
    console.log(`[refreshMcpConfig] ${sid}: credential files unchanged, skipping`);
  }

  // --- Write updated state file ---
  if (hashes) {
    const newState = {
      ...containerState,
      mcpConfigHash: hashes.mcpConfigHash,
      credFilesHash: hashes.credFilesHash,
      updatedAt: new Date().toISOString(),
    };
    await sandbox.writeFile('/tmp/vf-state.json', JSON.stringify(newState));
  }
}
```

**Step 2: Replace hardcoded sleep in startWsServer with port polling**

Replace the 500ms `setTimeout` with a loop that checks if port 8765 is bound:

```typescript
async startWsServer(sessionId: string): Promise<void> {
  const sid = sessionId.slice(0, 8);
  const sandbox = this.getSandboxInstance(sessionId);

  // Check if already running via port check (faster than pgrep)
  const portCheck = await sandbox.exec(
    'ss -tln 2>/dev/null | grep -q :8765 && echo "UP" || echo "DOWN"',
    { timeout: 3000 }
  );
  if (portCheck.stdout?.trim() === 'UP') {
    console.log(`[startWsServer] ${sid}: already running on :8765`);
    return;
  }

  // Start the WS server in background
  await sandbox.exec(
    'nohup node /opt/claude-agent/ws-agent-server.js > /tmp/ws-agent-server.log 2>&1 &',
    { timeout: 5000 }
  );

  // Poll for port binding (50ms intervals, 3s max)
  const MAX_WAIT = 3000;
  const INTERVAL = 50;
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT) {
    const check = await sandbox.exec(
      'ss -tln 2>/dev/null | grep -q :8765 && echo "UP" || echo "DOWN"',
      { timeout: 3000 }
    );
    if (check.stdout?.trim() === 'UP') {
      console.log(
        `[startWsServer] ${sid}: started in ${Date.now() - start}ms`
      );
      return;
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }

  // Final fallback — check pgrep
  const verify = await sandbox.exec(
    'pgrep -f ws-agent-server.js || true',
    { timeout: 5000 }
  );
  if (verify.stdout?.trim()) {
    console.log(`[startWsServer] ${sid}: started (pid ${verify.stdout.trim()})`);
  } else {
    console.error(
      `[startWsServer] ${sid}: failed to start — check /tmp/ws-agent-server.log`
    );
    throw new Error('WebSocket agent server failed to start');
  }
}
```

**Step 3: Verify**

Run: `npm run typecheck`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/sandbox.ts
git commit -m "perf: hash-aware skip logic + port polling in sandbox manager"
```

---

## Task 3: Parallelize handleSdkWs

**Files:**
- Modify: `src/api/sdk.ts` (handleSdkWs function)
- Modify: `src/config-assembly.ts` (add hash computation)

**Step 1: Add hash computation to config-assembly**

After assembling config, compute hashes of the MCP and credential sections:

```typescript
// At top of config-assembly.ts, add import:
import { configHash } from './lib/config-hash';

// New export alongside assembleSandboxConfig:
export async function assembleSandboxConfigWithHashes(
  kv: KVNamespace,
  userId: string
): Promise<{ config: SandboxConfig; hashes: { mcpConfigHash: string; credFilesHash: string } }> {
  const config = await assembleSandboxConfig(kv, userId);

  const mergedMcp = {
    ...(config.mcpServers || {}),
    ...(config.pluginConfigs?.mcpServers || {}),
    ...(config.geminiMcpServers || {}),
  };

  const [mcpConfigHash, credFilesHash] = await Promise.all([
    configHash(mergedMcp),
    configHash(config.credentialFiles as unknown as Record<string, unknown>),
  ]);

  return { config, hashes: { mcpConfigHash, credFilesHash } };
}
```

**Step 2: Rewrite handleSdkWs with parallel execution groups**

Replace the sequential chain in `handleSdkWs()` with two parallel groups:

```typescript
// In handleSdkWs, replace lines 513-605 with:

// --- Group A: Config + Wake (parallel) ---
const [{ config: sandboxConfig, hashes }, session] = await Promise.all([
  assembleSandboxConfigWithHashes(env.SESSIONS_KV, user.id),
  sandboxManager.getOrWakeSandbox(sessionId),
]);

if (!session || session.userId !== user.id) {
  return new Response('Session not found', { status: 404 });
}
if (!session.sandboxId) {
  return new Response('Sandbox not active', { status: 400 });
}

// Non-blocking: persist user message to KV in background
const userMsgId = crypto.randomUUID();
const userMessage: Message = {
  id: userMsgId,
  sessionId,
  role: 'user',
  content: prompt,
  timestamp: new Date().toISOString(),
};
// Use waitUntil from the execution context (passed via env or closure)
const kvWritePromise = env.SESSIONS_KV.put(
  `message:${sessionId}:${userMsgId}`,
  JSON.stringify(userMessage),
  { expirationTtl: 7 * 24 * 60 * 60 }
);

// Strip command/agent prefix (same as before)
const cmdPrefixMatch = prompt.match(/^\[(command|agent):\/([^\]]+)\]\n/);
let sdkPrompt = prompt;
if (cmdPrefixMatch) {
  const [fullMatch, kind, name] = cmdPrefixMatch;
  const body = prompt.slice(fullMatch.length);
  sdkPrompt = kind === 'agent'
    ? `Use the "${name}" agent (available via the Task tool) to handle this request.`
      + ` The agent's instructions:\n\n${body}`
    : `The user is running the /${name} command.`
      + ` Follow the instructions below:\n\n${body}`;
}

const sdkSessionId = session.sdkSessionId || '';

// Compute fresh MCP config for env var injection
const freshMcpConfig = {
  ...(sandboxConfig.mcpServers || {}),
  ...(sandboxConfig.pluginConfigs?.mcpServers || {}),
  ...(sandboxConfig.geminiMcpServers || {}),
};
const mcpConfigStr = Object.keys(freshMcpConfig).length > 0
  ? JSON.stringify(freshMcpConfig)
  : null;

// Diagnostic logging
const mcpNames = Object.keys(freshMcpConfig);
console.log(`[sdk/ws] MCP servers (${mcpNames.length}): ${mcpNames.join(', ')}`);
if (mcpNames.length > 0) {
  for (const [name, cfg] of Object.entries(freshMcpConfig)) {
    const c = cfg as Record<string, unknown>;
    const transport = c.command ? 'stdio' : c.type || c.url ? 'http' : 'unknown';
    console.log(
      `[sdk/ws]   ${name}: ${transport}`
      + `${c.command ? ` cmd=${c.command}` : ''}`
      + `${c.url ? ` url=${String(c.url).slice(0, 60)}` : ''}`
    );
  }
}

try {
  // --- Group B: Container prep (parallel) ---
  const setupStart = Date.now();

  await Promise.all([
    sandboxManager.refreshMcpConfig(session.sandboxId!, sandboxConfig, hashes),
    sandboxManager.startWsServer(session.sandboxId!),
    sandboxManager.writeContextFile(session.sandboxId!, {
      prompt: sdkPrompt,
      sessionId: sdkSessionId,
      cwd,
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken!,
        NODE_PATH: '/usr/local/lib/node_modules',
        CLAUDE_CONFIG_DIR: '/root/.claude',
        ...collectProjectSecrets(env),
        ...await collectUserSecrets(env.SESSIONS_KV, user.id),
        ...(mcpConfigStr ? { CLAUDE_MCP_SERVERS: mcpConfigStr } : {}),
        VF_SESSION_MODE: mode,
        VF_AUTO_CONTEXT: sandboxConfig.autoContext === false ? '0' : '1',
      },
    }),
    kvWritePromise, // Non-blocking — included in parallel group
  ]);

  console.log(
    `[sdk/ws] setup complete in ${Date.now() - setupStart}ms`
  );

  // Proxy the WebSocket connection
  return sandboxManager.wsConnectToSandbox(session.sandboxId!, request);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[sdk/ws] FAILED: ${msg}`);
  return new Response(`WebSocket setup failed: ${msg}`, { status: 500 });
}
```

**Important note:** `getOrWakeSandbox` currently takes `(sessionId, sandboxConfig)` — check if the second param is needed for wake. If so, config assembly must complete before wake. In that case, keep them sequential but still parallelize Group B.

**Step 3: Update import in sdk.ts**

Replace `assembleSandboxConfig` import with `assembleSandboxConfigWithHashes`:

```typescript
import { assembleSandboxConfigWithHashes } from '../config-assembly';
```

**Step 4: Verify**

Run: `npm run typecheck`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/api/sdk.ts src/config-assembly.ts
git commit -m "perf: parallelize handleSdkWs + non-blocking KV write"
```

---

## Task 4: Replace 150ms Hardcoded Wait with File Polling

**Files:**
- Modify: `Dockerfile` (ws-agent-server.js heredoc, lines ~755-766)

**Step 1: Replace setTimeout with polling loop**

In the Dockerfile's ws-agent-server.js heredoc, replace:

```javascript
// OLD:
// setTimeout(() => startQuery(ws), 150);

// NEW — poll for context file (50ms intervals, 3s max):
const POLL_INTERVAL = 50;
const POLL_MAX = 3000;
let elapsed = 0;
const pollTimer = setInterval(() => {
  elapsed += POLL_INTERVAL;
  if (fs.existsSync(CONTEXT_FILE)) {
    clearInterval(pollTimer);
    startQuery(ws);
  } else if (elapsed >= POLL_MAX) {
    clearInterval(pollTimer);
    console.log('[ws-agent-server] context file not found after 3s');
    sendJson(ws, { type: 'error', error: 'Context file timeout' });
    sendJson(ws, { type: 'process-exit', exitCode: 1 });
    ws.close();
  }
}, POLL_INTERVAL);
```

This replaces the fixed 150ms wait with a reactive poll that fires as soon as the context file appears (typically 10-50ms).

**Step 2: Verify Dockerfile syntax**

Run: `npm run typecheck` (won't catch Dockerfile issues, but ensures nothing else broke)

Check the heredoc manually for balanced quotes and EOF markers.

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "perf: replace 150ms hardcoded wait with file polling in ws-agent-server"
```

---

## Task 5: Pre-Start WS Server at Session Creation

**Files:**
- Modify: `src/api/sessions.ts` (session create handler)

**Step 1: Add pre-start after sandbox creation**

In the session create handler, after `createSandbox()` returns (line ~109), add a background pre-start of the WS server so it's already running before the first message:

```typescript
// After line 109 (session = await sandboxManager.createSandbox(...))
// and BEFORE the MCP KV persist (line 112):

// Pre-start WS server in background so first message doesn't wait for it
if (session.sandboxId) {
  c.executionCtx.waitUntil(
    sandboxManager.startWsServer(session.sandboxId).catch((err) => {
      console.warn('[sessions/create] WS server pre-start failed (non-fatal):', err);
    })
  );
}
```

This means the WS server will already be listening on port 8765 when the first message arrives, saving ~500-800ms.

**Step 2: Also pre-install npm packages at session creation**

After sandbox creation, trigger a background npm install if MCP config has npx servers. This moves the 0-60s npm install from the message path to the session creation path:

```typescript
// In the same block, after WS server pre-start:
// Pre-install npx packages so first message doesn't wait for npm
const mergedMcp: Record<string, Record<string, unknown>> = {
  ...(mcpServers || {}),
  ...(pluginConfigs?.mcpServers || {}),
  ...(geminiMcp || {}),
};
const npxPkgs: string[] = [];
for (const [, cfg] of Object.entries(mergedMcp)) {
  const c = cfg as Record<string, unknown>;
  if (c.command === 'npx' && Array.isArray(c.args)) {
    const pkg = (c.args as string[]).find((a: string) => !a.startsWith('-'));
    if (pkg) npxPkgs.push(pkg);
  }
}
if (npxPkgs.length > 0 && session.sandboxId) {
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const sb = sandboxManager.getSandboxInstance(session.sandboxId!);
        const installCmd =
          `npm install -g ${npxPkgs.join(' ')} --prefer-offline 2>&1 || true`;
        await sb.exec(installCmd, { timeout: 60_000 });
        console.log(`[sessions/create] pre-installed ${npxPkgs.length} npx packages`);
      } catch (err) {
        console.warn('[sessions/create] npx pre-install failed (non-fatal):', err);
      }
    })()
  );
}
```

**Step 3: Expose getSandboxInstance as public**

Check if `getSandboxInstance` is private in `SandboxManager`. If so, make it public or add a method to get the sandbox by ID:

In `src/sandbox.ts`, find `getSandboxInstance` and ensure it's accessible. If it's private, change to public or add a wrapper.

**Step 4: Verify**

Run: `npm run typecheck`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/api/sessions.ts src/sandbox.ts
git commit -m "perf: pre-start WS server + pre-install npm at session creation"
```

---

## Task 6: Timing Diagnostics

**Files:**
- Modify: `src/api/sdk.ts` (add timing logs to handleSdkWs)

**Step 1: Add timing instrumentation**

Wrap the parallel groups with timing measurements so we can verify the optimization in production logs:

```typescript
// At start of handleSdkWs (after param parsing):
const t0 = Date.now();

// After Group A:
const tGroupA = Date.now();
console.log(`[sdk/ws] Group A (config+wake): ${tGroupA - t0}ms`);

// After Group B:
const tGroupB = Date.now();
console.log(`[sdk/ws] Group B (container prep): ${tGroupB - tGroupA}ms`);
console.log(`[sdk/ws] Total setup: ${tGroupB - t0}ms`);
```

**Step 2: Commit**

```bash
git add src/api/sdk.ts
git commit -m "perf: add timing diagnostics to handleSdkWs"
```

---

## Task 7: Build, Deploy, Verify

**Files:**
- All modified files from Tasks 1-6

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

**Step 2: Build**

```bash
npm run build
```

Expected: Clean build with no errors.

**Step 3: Prune Docker cache (MANDATORY)**

```bash
docker builder prune --all -f && docker image prune -a -f
```

This prevents the "Image already exists remotely, skipping push" trap.

**Step 4: Deploy**

```bash
npx wrangler deploy
```

Expected: Successful deployment with new container image pushed.

**Step 5: Verify timing in production**

Send a message in VaporForge and check Worker logs for:
- `[sdk/ws] Group A (config+wake): XXms`
- `[sdk/ws] Group B (container prep): XXms`
- `[sdk/ws] Total setup: XXms`

**Warm path target:** Total setup < 2000ms
**Cold path target:** Total setup < 20000ms

**Step 6: Version bump**

Update `package.json` version to `0.24.0` and `ui/src/lib/version.ts` to match.

**Step 7: Commit and push**

```bash
git add -A
git commit -m "feat: Cortex v0.24.0 — streaming latency optimization

- Hash-based skip logic for MCP config + credential files
- Parallel execution of config assembly, sandbox wake, and container prep
- Port polling replaces 500ms hardcoded sleep in startWsServer
- File polling replaces 150ms hardcoded wait in ws-agent-server.js
- Pre-start WS server + npm packages at session creation
- Non-blocking KV write for user messages
- Timing diagnostics in handleSdkWs"

git push origin main
```

---

## Dependency Graph

```
Task 1 (config-hash.ts) ─────┐
                              ├──> Task 3 (parallelize handleSdkWs)
Task 2 (sandbox.ts skip) ────┘           |
                                          ├──> Task 6 (timing) ──> Task 7 (deploy)
Task 4 (Dockerfile polling) ──────────────┘
Task 5 (session pre-start) ──────────────┘
```

Tasks 1+2 are prerequisites for Task 3. Tasks 4 and 5 are independent. Task 6 depends on Task 3. Task 7 depends on all.

---

## Expected Warm Path After Optimization

| Step | Before | After |
|------|--------|-------|
| Config assembly | ~200-500ms (sequential) | ~200-500ms (parallel with wake) |
| Sandbox wake check | ~50ms | ~50ms (parallel with config) |
| KV write user msg | ~50ms (blocking) | 0ms (background) |
| refreshMcpConfig | ~100ms + npm 0-60s | 0ms (hash match = skip) |
| startWsServer | ~800ms (500ms sleep) | 0ms (pre-started + port check) |
| writeContextFile | ~100ms | ~100ms (parallel) |
| Container 150ms wait | 150ms | ~10-50ms (file poll) |
| **Total** | **~1400ms + npm** | **~300-600ms** |
