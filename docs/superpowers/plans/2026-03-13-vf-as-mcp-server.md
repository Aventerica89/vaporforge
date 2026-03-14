# VaporForge as MCP Server — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose VaporForge as a remote MCP server so any MCP-capable client (Claude Desktop, Cursor, etc.) can use VF's sandbox as tools.

**Architecture:** `VfMcpAgent extends McpAgent` Durable Object integrated into the existing VF Worker. `@cloudflare/workers-oauth-provider` acts as the OAuth AS — users authenticate via their VF setup-token, get an MCP access token. The DO receives `props: { vfUserId }` and can then create sessions, run commands, and read/write files in that user's container.

**Tech Stack:** `agents@^0.0.100` (McpAgent base), `@cloudflare/workers-oauth-provider@^0.0.5`, `@modelcontextprotocol/sdk` (transitive dep of agents), `zod`, `hono`, `@cloudflare/sandbox`

---

## Context

This implements the spec at `/Users/jb/Obsidian-Claude/John Notes/VaporForge/Research/VF as MCP Server - Implementation Spec.md`. The spec is "Ready to Implement" and covers Phase 1 (6 tools + OAuth). VF V1.5 streaming is stable. This is a new entry point — no existing VF infrastructure changes required beyond mounting routes and adding bindings.

Key constraint: Container bindings (`env.Sandbox`) are per-Worker. VfMcpAgent must live in the **same Worker** as the rest of VF, not a separate Worker.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/vf-mcp-agent.ts` | **Create** | VfMcpAgent DO class — tool definitions |
| `src/api/mcp-server.ts` | **Create** | Hono routes for `/mcp/oauth/*` + createMcpRouter() |
| `src/router.ts` | **Modify** | Mount `/mcp/*` routes (single `app.all` catch) |
| `wrangler.jsonc` | **Modify** | Add `MCP_AGENT` DO binding + `OAUTH_KV` namespace + v5 migration |
| `worker-configuration.d.ts` | **Modify** | Add `MCP_AGENT` and `OAUTH_KV` to `Env` |
| `src/index.ts` | **Modify** | Export `VfMcpAgent` |
| `package.json` | **Modify** | Add `agents` + `@cloudflare/workers-oauth-provider` |

---

## Chunk 1: Dependencies + Types

### Task 1: Install dependencies and update types

**Files:**
- Modify: `package.json`
- Modify: `worker-configuration.d.ts`

- [ ] **Step 1: Add dependencies to package.json**

Add to `dependencies` in `package.json`:
```json
"agents": "^0.0.100",
"@cloudflare/workers-oauth-provider": "^0.0.5"
```

- [ ] **Step 2: Install**

```bash
cd /Users/jb/repos/vaporforge/.worktrees/feat-vibesdk-streaming-arch
npm install
```

Expected: `agents` and `@cloudflare/workers-oauth-provider` appear in `node_modules/`.

- [ ] **Step 3: Update worker-configuration.d.ts — add MCP_AGENT and OAUTH_KV to Env**

In `worker-configuration.d.ts`, add after the `CHAT_SESSIONS` line:
```typescript
    // MCP Server (VfMcpAgent DO)
    MCP_AGENT: DurableObjectNamespace;

    // OAuth KV for MCP token storage
    OAUTH_KV: KVNamespace;
```

- [ ] **Step 4: Update wrangler.jsonc — add DO binding + KV namespace + migration**

In `wrangler.jsonc`, add to `durable_objects.bindings` array:
```json
{
  "name": "MCP_AGENT",
  "class_name": "VfMcpAgent"
}
```

Add to `migrations` array (after the existing v4 entry):
```json
{
  "tag": "v5",
  "new_sqlite_classes": ["VfMcpAgent"]
}
```

Add to `kv_namespaces` array:
```json
{
  "binding": "OAUTH_KV",
  "id": "PLACEHOLDER_PROVISION_NEW_KV"
}
```

> **Note:** `id` is a placeholder — must provision a real KV namespace via `wrangler kv:namespace create OAUTH_KV` and replace before deploy.

- [ ] **Step 5: Run typecheck to verify no regressions**

```bash
npm run typecheck
```

Expected: No errors (new bindings are only additive).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json worker-configuration.d.ts wrangler.jsonc
git commit -m "feat: add agents + workers-oauth-provider deps, MCP_AGENT binding"
```

---

## Chunk 2: VfMcpAgent DO

### Task 2: Implement VfMcpAgent class

**Files:**
- Create: `src/agents/vf-mcp-agent.ts`

> No tests for this task — McpAgent DO behavior is integration-tested via actual MCP client connection. Unit tests are in Task 5.

- [ ] **Step 1: Create `src/agents/vf-mcp-agent.ts`**

```typescript
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSandbox } from '@cloudflare/sandbox';
import type { Session } from '../types';

export interface VfMcpProps {
  vfUserId: string;
}

export interface VfMcpState {
  activeSessionId: string | null;
}

export class VfMcpAgent extends McpAgent<Env, VfMcpState, VfMcpProps> {
  server = new McpServer({ name: 'VaporForge', version: '1.0.0' });
  initialState: VfMcpState = { activeSessionId: null };

  async init() {
    this.registerSessionTools();
    this.registerCommandTools();
    this.registerFileTools();
  }

  private requireSession(): string | null {
    return this.state.activeSessionId;
  }

  private errorContent(message: string) {
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    return this.env.SESSIONS_KV.get<Session>(`session:${sessionId}`, 'json');
  }

  private registerSessionTools() {
    this.server.tool(
      'vf_list_sessions',
      'List all VaporForge sessions for this account.',
      {},
      async () => {
        const { vfUserId } = this.props;
        const list = await this.env.SESSIONS_KV.list({ prefix: `session:` });
        const sessions: Array<{ id: string; name?: string; status: string }> = [];
        for (const key of list.keys) {
          const session = await this.env.SESSIONS_KV.get<Session>(key.name, 'json');
          if (session && session.userId === vfUserId) {
            sessions.push({ id: session.id, status: session.status });
          }
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(sessions, null, 2) }],
        };
      }
    );

    this.server.tool(
      'vf_attach_session',
      'Attach to an existing VaporForge session. Future tool calls operate in this session.',
      { sessionId: z.string().describe('The session ID to attach to') },
      async ({ sessionId }) => {
        const { vfUserId } = this.props;
        const session = await this.getSession(sessionId);
        if (!session) return this.errorContent('Session not found.');
        if (session.userId !== vfUserId) return this.errorContent('Session does not belong to your account.');
        await this.setState({ activeSessionId: sessionId });
        return {
          content: [{ type: 'text' as const, text: `Attached to session ${sessionId} (status: ${session.status}).` }],
        };
      }
    );
  }

  private registerCommandTools() {
    this.server.tool(
      'vf_run_command',
      'Run a shell command in the active session workspace. Returns stdout + stderr + exit code.',
      {
        command: z.string().describe('Shell command to run, e.g. "npm install" or "ls -la"'),
        workingDir: z.string().default('/workspace').describe('Working directory'),
        timeoutMs: z.number().int().min(1000).max(60000).default(30000),
      },
      async ({ command, workingDir, timeoutMs }) => {
        const sessionId = this.requireSession();
        if (!sessionId) return this.errorContent('No active session. Call vf_attach_session first.');

        const session = await this.getSession(sessionId);
        if (!session?.sandboxId) return this.errorContent('Session has no active container.');
        if (session.userId !== this.props.vfUserId) return this.errorContent('Session ownership mismatch.');

        const sandbox = getSandbox(this.env.Sandbox, session.sandboxId);
        try {
          const result = await sandbox.execProcess(command, {
            cwd: workingDir,
            timeoutMs,
          });
          const output = `Exit ${result.exitCode}\n${result.stdout || ''}${result.stderr ? `\nSTDERR:\n${result.stderr}` : ''}`;
          return { content: [{ type: 'text' as const, text: output }] };
        } catch (err) {
          return this.errorContent(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }

  private registerFileTools() {
    const validatePath = (path: string): string | null => {
      if (!path.startsWith('/workspace/') && path !== '/workspace') {
        return 'Path must be under /workspace/';
      }
      // Prevent path traversal
      if (path.includes('..')) return 'Path traversal not allowed.';
      return null;
    };

    this.server.tool(
      'vf_read_file',
      'Read a file from the active session workspace.',
      { path: z.string().describe('Absolute path, e.g. /workspace/src/index.ts') },
      async ({ path }) => {
        const pathErr = validatePath(path);
        if (pathErr) return this.errorContent(pathErr);

        const sessionId = this.requireSession();
        if (!sessionId) return this.errorContent('No active session. Call vf_attach_session first.');

        const session = await this.getSession(sessionId);
        if (!session?.sandboxId) return this.errorContent('Session has no active container.');
        if (session.userId !== this.props.vfUserId) return this.errorContent('Session ownership mismatch.');

        const sandbox = getSandbox(this.env.Sandbox, session.sandboxId);
        try {
          const contents = await sandbox.readFile(path, { encoding: 'utf-8' });
          return { content: [{ type: 'text' as const, text: contents as string }] };
        } catch (err) {
          return this.errorContent(`Read failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    this.server.tool(
      'vf_write_file',
      'Write or overwrite a file in the active session workspace.',
      {
        path: z.string().describe('Absolute path under /workspace/'),
        content: z.string().describe('File content to write'),
      },
      async ({ path, content }) => {
        const pathErr = validatePath(path);
        if (pathErr) return this.errorContent(pathErr);

        const sessionId = this.requireSession();
        if (!sessionId) return this.errorContent('No active session. Call vf_attach_session first.');

        const session = await this.getSession(sessionId);
        if (!session?.sandboxId) return this.errorContent('Session has no active container.');
        if (session.userId !== this.props.vfUserId) return this.errorContent('Session ownership mismatch.');

        const sandbox = getSandbox(this.env.Sandbox, session.sandboxId);
        try {
          await sandbox.writeFile(path, content);
          return { content: [{ type: 'text' as const, text: `Written: ${path}` }] };
        } catch (err) {
          return this.errorContent(`Write failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    this.server.tool(
      'vf_list_files',
      'List files in the workspace. Returns a directory tree.',
      {
        path: z.string().default('/workspace').describe('Directory to list'),
        depth: z.number().int().min(1).max(5).default(2),
      },
      async ({ path, depth }) => {
        const pathErr = validatePath(path);
        if (pathErr) return this.errorContent(pathErr);

        const sessionId = this.requireSession();
        if (!sessionId) return this.errorContent('No active session. Call vf_attach_session first.');

        const session = await this.getSession(sessionId);
        if (!session?.sandboxId) return this.errorContent('Session has no active container.');
        if (session.userId !== this.props.vfUserId) return this.errorContent('Session ownership mismatch.');

        const sandbox = getSandbox(this.env.Sandbox, session.sandboxId);
        try {
          const result = await sandbox.execProcess(
            `find ${path} -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' | sort`,
            { cwd: '/workspace' }
          );
          return { content: [{ type: 'text' as const, text: result.stdout || '(empty)' }] };
        } catch (err) {
          return this.errorContent(`List failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors. If `agents/mcp` import fails — the package may need to be installed first (do Task 1 before Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/agents/vf-mcp-agent.ts
git commit -m "feat: add VfMcpAgent DO with 5 tools (list/attach sessions, run/read/write files)"
```

---

## Chunk 3: OAuth Routes + Router Mount

### Task 3: Implement mcp-server.ts OAuth routes and createMcpRouter

**Files:**
- Create: `src/api/mcp-server.ts`

The `@cloudflare/workers-oauth-provider` package provides the OAuth 2.0 authorization server. VF's `AuthService` validates the user's setup-token. On success, the OAuth provider issues a standard bearer token with the `vfUserId` in props.

- [ ] **Step 1: Check what AuthService.authenticateWithSetupToken returns**

Read `src/auth.ts` to understand the return type of `authenticateWithSetupToken`.

- [ ] **Step 2: Create `src/api/mcp-server.ts`**

```typescript
import { Hono } from 'hono';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { VfMcpAgent } from '../agents/vf-mcp-agent';
import { AuthService } from '../auth';

const authPageHtml = (state: string, error?: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect VaporForge</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e8e8e8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 2rem; width: 100%; max-width: 400px; }
    h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p { color: #888; font-size: 0.875rem; margin: 0 0 1.5rem; }
    input { width: 100%; box-sizing: border-box; background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 0.75rem; color: #e8e8e8; font-size: 0.875rem; margin-bottom: 1rem; }
    button { width: 100%; background: #e8e8e8; color: #0a0a0a; border: none; border-radius: 8px; padding: 0.75rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
    .error { color: #f87171; font-size: 0.8rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect VaporForge</h1>
    <p>Paste your VaporForge setup token to grant access.</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST">
      <input type="hidden" name="state" value="${state}" />
      <input type="password" name="token" placeholder="sk-ant-oat01-..." autocomplete="off" required />
      <button type="submit">Connect</button>
    </form>
  </div>
</body>
</html>`;

const oauthApp = new Hono<{ Bindings: Env }>();

oauthApp.get('/mcp/oauth/authorize', async (c) => {
  const oauthReqInfo = await (c.env as any).OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo) return c.text('Invalid authorization request', 400);
  return c.html(authPageHtml(oauthReqInfo.state || ''));
});

oauthApp.post('/mcp/oauth/authorize', async (c) => {
  const oauthReqInfo = await (c.env as any).OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo) return c.text('Invalid authorization request', 400);

  const body = await c.req.parseBody();
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token || !token.startsWith('sk-ant-')) {
    return c.html(authPageHtml(oauthReqInfo.state || '', 'Invalid token format.'));
  }

  const authService = new AuthService(c.env.AUTH_KV, c.env.JWT_SECRET);
  const result = await authService.authenticateWithSetupToken(token);
  if (!result) {
    return c.html(authPageHtml(oauthReqInfo.state || '', 'Invalid or expired setup token.'));
  }

  const { redirectTo } = await (c.env as any).OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: result.user.id,
    scope: oauthReqInfo.scope,
    props: { vfUserId: result.user.id },
  });

  return Response.redirect(redirectTo, 302);
});

export function createMcpRouter(env: Env): OAuthProvider {
  return new OAuthProvider({
    apiRoute: ['/mcp'],
    apiHandler: {
      fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/mcp/sse')) {
          return (VfMcpAgent as any).serveSSE('/mcp/sse').fetch(request, env, ctx);
        }
        return (VfMcpAgent as any).serve('/mcp').fetch(request, env, ctx);
      },
    },
    defaultHandler: { fetch: oauthApp.fetch.bind(oauthApp) },
    authorizeEndpoint: '/mcp/oauth/authorize',
    tokenEndpoint: '/mcp/oauth/token',
    clientRegistrationEndpoint: '/mcp/oauth/register',
  });
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors. If `OAuthProvider` type errors appear, cast as needed — the package is new and types may be incomplete.

- [ ] **Step 4: Commit**

```bash
git add src/api/mcp-server.ts
git commit -m "feat: add MCP OAuth routes and createMcpRouter"
```

---

### Task 4: Mount MCP routes in router + export VfMcpAgent

**Files:**
- Modify: `src/router.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add import to router.ts**

Add after the last import line in `src/router.ts`:
```typescript
import { createMcpRouter } from './api/mcp-server';
```

- [ ] **Step 2: Mount /mcp/* in router.ts**

Add before the `app.get('*', ...)` catch-all in `createRouter()`:
```typescript
  // MCP server — OAuth-protected, handles its own auth via OAuthProvider
  // Must bypass the Hono CORS/auth middleware — MCP clients set their own headers
  app.all('/mcp/*', (c) => {
    const mcpRouter = createMcpRouter(c.env);
    return mcpRouter.fetch(c.req.raw, c.env, c.executionCtx);
  });
```

- [ ] **Step 3: Export VfMcpAgent from index.ts**

In `src/index.ts`, add to the imports and exports at the top:
```typescript
import { VfMcpAgent } from './agents/vf-mcp-agent';
export { VfMcpAgent };
```

Add `VfMcpAgent` to the existing export line (next to `SessionDurableObject, ChatSessionAgent`):
```typescript
export { SessionDurableObject, ChatSessionAgent, VfMcpAgent };
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/router.ts src/index.ts
git commit -m "feat: mount /mcp/* routes, export VfMcpAgent"
```

---

## Chunk 4: OAUTH_KV Provisioning + Tests

### Task 5: Provision OAUTH_KV namespace and write integration smoke tests

**Files:**
- Modify: `wrangler.jsonc` (update OAUTH_KV id)
- Create: `src/__tests__/mcp-agent.test.ts`

- [ ] **Step 1: Provision OAUTH_KV**

```bash
npx wrangler kv:namespace create OAUTH_KV
```

Copy the output `id` value. Replace `PLACEHOLDER_PROVISION_NEW_KV` in `wrangler.jsonc` with the real ID.

- [ ] **Step 2: Write smoke tests for VfMcpAgent path validation**

Create `src/__tests__/mcp-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Isolated unit tests for path validation logic
// (McpAgent DO itself requires CF runtime — integration tests only)

describe('vf_read_file path validation', () => {
  const validatePath = (path: string): string | null => {
    if (!path.startsWith('/workspace/') && path !== '/workspace') {
      return 'Path must be under /workspace/';
    }
    if (path.includes('..')) return 'Path traversal not allowed.';
    return null;
  };

  it('allows valid workspace paths', () => {
    expect(validatePath('/workspace/src/index.ts')).toBeNull();
    expect(validatePath('/workspace')).toBeNull();
    expect(validatePath('/workspace/')).toBeNull();
  });

  it('rejects paths outside workspace', () => {
    expect(validatePath('/etc/passwd')).not.toBeNull();
    expect(validatePath('/root/.claude/credentials')).not.toBeNull();
    expect(validatePath('relative/path')).not.toBeNull();
  });

  it('rejects path traversal attempts', () => {
    expect(validatePath('/workspace/../etc/passwd')).not.toBeNull();
    expect(validatePath('/workspace/foo/../../etc')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test src/__tests__/mcp-agent.test.ts
```

Expected: 3 test cases pass.

- [ ] **Step 4: Full typecheck + test suite**

```bash
npm run typecheck && npm run test
```

Expected: No errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc src/__tests__/mcp-agent.test.ts
git commit -m "feat: provision OAUTH_KV, add path validation tests"
```

---

## Verification

After all tasks:

1. **TypeScript clean:** `npm run typecheck` — zero errors
2. **Tests pass:** `npm run test` — all pass including new mcp-agent tests
3. **Build succeeds:** `npm run build` — no errors
4. **Manual smoke test (after deploy):**
   - Add to Claude Desktop config:
     ```json
     { "mcpServers": { "vaporforge": { "command": "npx", "args": ["mcp-remote", "https://vaporforge.dev/mcp"] } } }
     ```
   - Claude Desktop should redirect to `vaporforge.dev/mcp/oauth/authorize`
   - Paste a valid VF setup-token
   - Claude Desktop receives MCP access token
   - Call `vf_list_sessions` — should return user's sessions
   - Call `vf_attach_session` with a real session ID
   - Call `vf_run_command` with `command: "echo hello"` — should return `Exit 0\nhello`

## Notes

- CORS: The `app.all('/mcp/*', ...)` handler bypasses VF's Hono CORS middleware intentionally — OAuthProvider handles its own CORS for MCP clients.
- `OAuthProvider` constructor types may require `as any` casts — the `@cloudflare/workers-oauth-provider@^0.0.5` package is early-stage.
- Do NOT deploy until `OAUTH_KV` has a real namespace ID (deploy will fail with a binding error).
- After deploy, `VfMcpAgent` must be in `wrangler.jsonc` `durable_objects.bindings` and `migrations` for it to be registered as a DO class.
