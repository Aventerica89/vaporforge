import { Hono } from 'hono';
import { z } from 'zod';
import type { SandboxManager } from '../sandbox';
import type { User } from '../types';
import { collectProjectSecrets } from '../sandbox';

type Variables = {
  user: User;
  authService: unknown;
  sandboxManager: SandboxManager;
};

// Schema for agency site records (KV-persisted)
const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().url(),
  pagesUrl: z.string().url().optional(),
  domain: z.string().max(253).optional(),
});

const UpdateSiteSchema = CreateSiteSchema.partial().extend({
  status: z.enum(['live', 'staging', 'building']).optional(),
  thumbnail: z.string().url().optional(),
});

export interface AgencySite {
  id: string;
  name: string;
  repoUrl: string;
  pagesUrl?: string;
  domain?: string;
  lastEdited: string;
  thumbnail?: string;
  status: 'live' | 'staging' | 'building';
}

const KV_PREFIX = 'agency-site:';

export const agencyRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Auth is handled by the parent protectedRoutes middleware

// List all agency sites
agencyRoutes.get('/sites', async (c) => {
  const kv = c.env.SESSIONS_KV;
  const list = await kv.list({ prefix: KV_PREFIX });
  const sites: AgencySite[] = [];

  for (const key of list.keys) {
    const value = await kv.get<AgencySite>(key.name, 'json');
    if (value) sites.push(value);
  }

  // Sort by lastEdited descending
  sites.sort((a, b) =>
    (b.lastEdited || '').localeCompare(a.lastEdited || '')
  );

  return c.json({ success: true, data: sites });
});

// Get single site
agencyRoutes.get('/sites/:id', async (c) => {
  const site = await c.env.SESSIONS_KV.get<AgencySite>(
    `${KV_PREFIX}${c.req.param('id')}`,
    'json'
  );
  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }
  return c.json({ success: true, data: site });
});

// Create site
agencyRoutes.post('/sites', async (c) => {
  const body = await c.req.json();
  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const site: AgencySite = {
    id,
    name: parsed.data.name,
    repoUrl: parsed.data.repoUrl,
    pagesUrl: parsed.data.pagesUrl,
    domain: parsed.data.domain,
    lastEdited: new Date().toISOString(),
    status: 'live',
  };

  await c.env.SESSIONS_KV.put(
    `${KV_PREFIX}${id}`,
    JSON.stringify(site)
  );

  return c.json({ success: true, data: site }, 201);
});

// Update site
agencyRoutes.put('/sites/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.SESSIONS_KV.get<AgencySite>(
    `${KV_PREFIX}${id}`,
    'json'
  );

  if (!existing) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const body = await c.req.json();
  const parsed = UpdateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const updated: AgencySite = {
    ...existing,
    ...parsed.data,
    id, // prevent ID override
    lastEdited: new Date().toISOString(),
  };

  await c.env.SESSIONS_KV.put(
    `${KV_PREFIX}${id}`,
    JSON.stringify(updated)
  );

  return c.json({ success: true, data: updated });
});

// Delete site
agencyRoutes.delete('/sites/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.SESSIONS_KV.get(`${KV_PREFIX}${id}`);
  if (!existing) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  await c.env.SESSIONS_KV.delete(`${KV_PREFIX}${id}`);
  return c.json({ success: true });
});

// Start editing session — kicks off setup inside the container (no waitUntil)
agencyRoutes.post('/sites/:id/edit', async (c) => {
  const id = c.req.param('id');
  console.log(`[agency] POST /edit starting for site ${id}`);

  const site = await c.env.SESSIONS_KV.get<AgencySite>(
    `${KV_PREFIX}${id}`,
    'json',
  );

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${id}`;

  // Kick off setup as a background process INSIDE the container.
  // This avoids the waitUntil 30s wall-clock limit entirely.
  try {
    console.log(`[agency] POST /edit calling kickoffAgencySetup for ${id}`);
    await sm.kickoffAgencySetup(id, site.repoUrl);
    console.log(`[agency] POST /edit kickoffAgencySetup returned for ${id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agency] kickoffAgencySetup failed for ${id}:`, msg);
    return c.json({
      success: false,
      error: `Failed to start provisioning: ${msg}`,
    }, 500);
  }

  return c.json({
    success: true,
    data: { status: 'provisioning', sessionId },
  });
});

// Poll editing session status — checks container dev server, exposes port when ready
agencyRoutes.get('/sites/:id/edit/status', async (c) => {
  const id = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${id}`;
  const parts = new URL(c.req.url).hostname.split('.');
  const hostname = parts.slice(-2).join('.');

  console.log(`[agency] poll /edit/status for site ${id}`);

  // Check the in-container setup script status
  try {
    const { ready, stage } = await sm.isAgencyDevServerUp(sessionId);
    console.log(`[agency] poll: stage="${stage}", ready=${ready}`);

    if (ready) {
      // Dev server is listening — expose port and return URL
      console.log(`[agency] poll: dev server ready for ${id}, exposing port`);
      const result = await sm.exposePort(sessionId, 4321, hostname);

      // Pre-start the WS agent server so it's warm before the first edit request.
      // Fire-and-forget — don't block the status response.
      sm.startWsServer(sessionId).catch((e: unknown) => {
        console.warn(`[agency] pre-start ws-server for ${id}:`, e);
      });

      // Update site status to staging
      const site = await c.env.SESSIONS_KV.get<AgencySite>(
        `${KV_PREFIX}${id}`,
        'json',
      );
      if (site) {
        const updated: AgencySite = {
          ...site,
          status: 'staging',
          lastEdited: new Date().toISOString(),
        };
        await c.env.SESSIONS_KV.put(
          `${KV_PREFIX}${id}`,
          JSON.stringify(updated),
        );
      }

      return c.json({
        success: true,
        data: { status: 'ready', previewUrl: result.url, sessionId },
      });
    }

    if (stage === 'stage:timeout' || stage === 'stage:install-failed') {
      return c.json({
        success: true,
        data: {
          status: 'error',
          error: stage === 'stage:install-failed'
            ? 'npm install failed — check the repository'
            : 'Dev server failed to start within 90 seconds',
        },
      });
    }

    // Map stage to a human-readable status
    const stageMap: Record<string, string> = {
      'stage:cloning': 'Cloning repository...',
      'stage:installing': 'Installing dependencies...',
      'stage:starting': 'Starting dev server...',
      'stage:unknown': 'Provisioning...',
      'unreachable': 'Starting container...',
    };

    return c.json({
      success: true,
      data: {
        status: 'provisioning',
        message: stageMap[stage] ?? 'Provisioning...',
      },
    });
  } catch (e) {
    // Container not reachable yet
    console.log(`[agency] poll: container unreachable:`, e instanceof Error ? e.message : String(e));
    return c.json({
      success: true,
      data: { status: 'provisioning', message: 'Starting container...' },
    });
  }
});

// Get dev server setup logs for diagnostics
agencyRoutes.get('/sites/:id/edit/logs', async (c) => {
  const id = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${id}`;

  try {
    const logs = await sm.readAgencySetupLog(sessionId);
    return c.json({ success: true, data: { logs } });
  } catch (e) {
    return c.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

// Read an Astro source file from the container
// GET /api/agency/sites/:id/source?file=src/components/heroes/HeroCentered.astro
agencyRoutes.get('/sites/:id/source', async (c) => {
  const siteId = c.req.param('id');
  const file = c.req.query('file') || '';

  // Validate: must be a relative path, no traversal, must be .astro file
  if (!file || file.includes('..') || !file.endsWith('.astro')) {
    return c.json({ success: false, error: 'Invalid file path' }, 400);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  try {
    const result = await sm.execInSandbox(sessionId, `cat "/workspace/${file}"`, {
      cwd: '/workspace',
    });
    // Cap at 6000 chars to keep prompt size reasonable
    return c.json({ success: true, data: { content: result.stdout.slice(0, 6000) } });
  } catch {
    return c.json({ success: false, error: 'File not found' }, 404);
  }
});

// Auto-commit changes in the agency container
const CommitSchema = z.object({
  componentName: z.string().min(1).max(200),
  instruction: z.string().min(1).max(2000),
});

agencyRoutes.post('/sites/:id/commit', async (c) => {
  const siteId = c.req.param('id');
  const body = await c.req.json();
  const parsed = CommitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  const truncated = parsed.data.instruction.slice(0, 50);
  const message = `agency: Update ${parsed.data.componentName}: ${truncated}`;

  try {
    // Fixed command strings — no user input in commands
    await sm.execInSandbox(sessionId, 'git add -A', { cwd: '/workspace' });
    await sm.execInSandbox(sessionId, `git commit -m '${message.replace(/'/g, "'\\''")}'`, {
      cwd: '/workspace',
    });

    return c.json({ success: true, data: { message } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({
      success: false,
      error: `Commit failed: ${msg}`,
    }, 500);
  }
});

// Get diff of changes in the agency container
agencyRoutes.get('/sites/:id/diff', async (c) => {
  const siteId = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  try {
    // Status summary (includes untracked new files the agent may have created)
    const statusResult = await sm.execInSandbox(sessionId, 'git status --short', {
      cwd: '/workspace',
    });

    // Stat summary of changes to tracked files
    const statResult = await sm.execInSandbox(sessionId, 'git diff --stat', {
      cwd: '/workspace',
    });

    // Full diff (tracked files)
    const fullResult = await sm.execInSandbox(sessionId, 'git diff', {
      cwd: '/workspace',
    });

    const summary = [statusResult.stdout?.trim(), statResult.stdout?.trim()]
      .filter(Boolean)
      .join('\n');

    return c.json({
      success: true,
      data: {
        summary,
        diff: fullResult.stdout,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({
      success: false,
      error: `Diff failed: ${msg}`,
    }, 500);
  }
});

// Push changes to remote — triggers CF Pages or similar deploy
agencyRoutes.post('/sites/:id/push', async (c) => {
  const siteId = c.req.param('id');
  const site = await c.env.SESSIONS_KV.get<AgencySite>(
    `${KV_PREFIX}${siteId}`,
    'json',
  );

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  try {
    // Push current branch to remote (fixed commands, no user input)
    await sm.execInSandbox(sessionId, 'git push origin HEAD', {
      cwd: '/workspace',
      timeout: 30_000,
    });

    // Update site status to building
    const updated: AgencySite = {
      ...site,
      status: 'building',
      lastEdited: new Date().toISOString(),
    };
    await c.env.SESSIONS_KV.put(
      `${KV_PREFIX}${siteId}`,
      JSON.stringify(updated),
    );

    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({
      success: false,
      error: `Push failed: ${msg}`,
    }, 500);
  }
});

// HTTP pre-flight endpoint — exported for router.ts (needs inline WS auth).
// Validates the token, starts the WS server, builds the prompt, and writes the
// context file so that the actual WS upgrade handler can be a trivial proxy.
// All operations that can fail with a readable error happen HERE, not in the WS
// handler (where errors are opaque — ws.onerror gives no body information).
export async function handleAgencyEditPreflight(
  env: Env,
  request: Request,
  user: User,
  sandboxManager: SandboxManager,
): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId') || '';
  const instruction = url.searchParams.get('instruction') || '';
  const componentFile = url.searchParams.get('componentFile') || null;
  const siteWide = url.searchParams.get('siteWide') === 'true';
  const elementHTML = url.searchParams.get('elementHTML') || '';

  if (!siteId || !instruction) {
    return Response.json({ success: false, error: 'Missing siteId or instruction' }, { status: 400 });
  }

  if (!user.claudeToken) {
    return Response.json({ success: false, error: 'No Claude token configured. Please re-authenticate.' }, { status: 401 });
  }
  if (!user.claudeToken.startsWith('sk-ant-oat01-')) {
    return Response.json({
      success: false,
      error: 'Agency mode requires a Claude OAuth token (sk-ant-oat01-*). Re-authenticate using `claude setup-token` on your Mac, then paste the token at /app.',
    }, { status: 401 });
  }

  const sessionId = `agency-${siteId}`;

  // Fetch the file source so the AI has full context (optional — proceed without it if missing)
  let fileSource = '';
  if (componentFile && !siteWide) {
    try {
      const safePath = componentFile.replace(/\.\./g, '');
      const result = await sandboxManager.execInSandbox(sessionId, `cat "/workspace/${safePath}"`);
      fileSource = (result.stdout || '').slice(0, 6000);
    } catch {
      // File source is optional
    }
  }

  // Build the self-contained prompt (claude-agent.js uses claude_code preset, never reads env vars for prompts)
  const fullPrompt = siteWide
    ? [
        'Edit the website theme styles.',
        '',
        `Task: ${instruction}`,
        '',
        'Rules:',
        '- Modify ONLY CSS custom properties in the styles directory',
        '- Do not change .astro component files',
      ].join('\n')
    : [
        `Edit the file: ${componentFile}`,
        '',
        ...(elementHTML ? ['Selected element:', elementHTML, ''] : []),
        `Task: ${instruction}`,
        '',
        ...(fileSource ? ['Current file source:', fileSource, ''] : []),
        'Rules:',
        `- Edit ONLY ${componentFile}`,
        '- Preserve data-vf-component and data-vf-file attributes on elements',
        '- Keep the file syntactically valid Astro',
        ...(elementHTML ? ['- Modify the selected element or its children to fulfill the task'] : []),
      ].join('\n');

  // Start the WS agent server — surfaces error as readable JSON
  try {
    await sandboxManager.startWsServer(sessionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agency] preflight startWsServer failed for ${siteId}:`, msg);
    return Response.json({ success: false, error: `Container not ready: ${msg}` }, { status: 503 });
  }

  // Write the context file — ws-agent-server.js reads this when the WS connection opens
  try {
    await sandboxManager.writeContextFile(sessionId, {
      prompt: fullPrompt,
      sessionId: '',
      cwd: '/workspace',
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: user.claudeToken,
        NODE_PATH: '/usr/local/lib/node_modules',
        CLAUDE_CONFIG_DIR: '/root/.claude',
        IS_SANDBOX: '1',
        ...collectProjectSecrets(env),
        VF_AGENCY_MODE: '1',
        VF_AUTO_CONTEXT: '0',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agency] preflight writeContextFile failed for ${siteId}:`, msg);
    return Response.json({ success: false, error: `Failed to prepare edit context: ${msg}` }, { status: 500 });
  }

  return Response.json({ success: true });
}

// WS endpoint for agency edits — exported for router.ts (needs inline WS auth).
// The pre-flight endpoint does all the heavy lifting (token validation, WS server
// warm-up, context file write). This handler only needs to proxy the WS upgrade.
export async function handleAgencyEditWs(
  env: Env,
  request: Request,
  user: User,
  sandboxManager: SandboxManager,
): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId') || '';

  console.log(`[agency/ws] handler called: siteId=${siteId}, token=${user.claudeToken?.slice(0, 15)}...`);

  if (!siteId) {
    console.log(`[agency/ws] missing siteId`);
    return new Response('Missing siteId', { status: 400 });
  }
  if (!user.claudeToken || !user.claudeToken.startsWith('sk-ant-oat01-')) {
    console.log(`[agency/ws] invalid token type — not OAuth`);
    return new Response('Agency mode requires a Claude OAuth token', { status: 401 });
  }

  const sessionId = `agency-${siteId}`;
  console.log(`[agency/ws] calling wsConnect for sessionId=${sessionId}`);

  try {
    // Pre-flight already warmed the WS server and wrote the context file.
    // Do NOT call startWsServer here — extra exec calls before wsConnect can interfere
    // with the WS proxy. Just proxy the upgrade directly.
    const wsResp = await sandboxManager.wsConnectToSandbox(sessionId, request);
    console.log(`[agency/ws] wsConnect returned status=${wsResp.status}`);
    return wsResp;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agency/ws] wsConnect THREW: ${msg}`);
    return new Response(`Agency WS failed: ${msg}`, { status: 500 });
  }
}
