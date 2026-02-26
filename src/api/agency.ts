import { Hono } from 'hono';
import { z } from 'zod';
import { streamText } from 'ai';
import type { SandboxManager } from '../sandbox';
import type { User } from '../types';
import { collectProjectSecrets } from '../sandbox';
import { createModel, getProviderCredentials } from '../services/ai-provider-factory';

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
  userId: string;
  name: string;
  repoUrl: string;
  pagesUrl?: string;
  domain?: string;
  lastEdited: string;
  thumbnail?: string;
  status: 'live' | 'staging' | 'building';
}

const KV_PREFIX = 'agency-site:';

/** Returns the site only if it belongs to the given userId, otherwise null. */
async function getOwnedSite(
  kv: KVNamespace,
  siteId: string,
  userId: string,
): Promise<AgencySite | null> {
  const site = await kv.get<AgencySite>(`${KV_PREFIX}${siteId}`, 'json');
  if (!site || site.userId !== userId) return null;
  return site;
}

export const agencyRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Auth is handled by the parent protectedRoutes middleware

// List agency sites for the authenticated user
agencyRoutes.get('/sites', async (c) => {
  const user = c.get('user') as User;
  const kv = c.env.SESSIONS_KV;
  const list = await kv.list({ prefix: KV_PREFIX });
  const sites: AgencySite[] = [];

  for (const key of list.keys) {
    const value = await kv.get<AgencySite>(key.name, 'json');
    if (value && value.userId === user.id) sites.push(value);
  }

  // Sort by lastEdited descending
  sites.sort((a, b) =>
    (b.lastEdited || '').localeCompare(a.lastEdited || '')
  );

  return c.json({ success: true, data: sites });
});

// Get single site
agencyRoutes.get('/sites/:id', async (c) => {
  const user = c.get('user') as User;
  const site = await getOwnedSite(c.env.SESSIONS_KV, c.req.param('id'), user.id);
  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }
  return c.json({ success: true, data: site });
});

// Create site
agencyRoutes.post('/sites', async (c) => {
  const user = c.get('user') as User;
  const body = await c.req.json();
  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const site: AgencySite = {
    id,
    userId: user.id,
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
  const user = c.get('user') as User;
  const id = c.req.param('id');
  const existing = await getOwnedSite(c.env.SESSIONS_KV, id, user.id);

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
  const user = c.get('user') as User;
  const id = c.req.param('id');
  const existing = await getOwnedSite(c.env.SESSIONS_KV, id, user.id);
  if (!existing) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  await c.env.SESSIONS_KV.delete(`${KV_PREFIX}${id}`);
  return c.json({ success: true });
});

// Start editing session — kicks off setup inside the container (no waitUntil)
agencyRoutes.post('/sites/:id/edit', async (c) => {
  const user = c.get('user') as User;
  const id = c.req.param('id');
  console.log(`[agency] POST /edit starting for site ${id}`);

  const site = await getOwnedSite(c.env.SESSIONS_KV, id, user.id);

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
  const user = c.get('user') as User;
  const id = c.req.param('id');
  if (!await getOwnedSite(c.env.SESSIONS_KV, id, user.id)) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }
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
  const user = c.get('user') as User;
  const id = c.req.param('id');
  if (!await getOwnedSite(c.env.SESSIONS_KV, id, user.id)) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }
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
  const user = c.get('user') as User;
  const siteId = c.req.param('id');
  const file = c.req.query('file') || '';

  // Validate: relative path only, no traversal, .astro extension only, safe chars
  if (
    !file ||
    file.startsWith('/') ||
    file.includes('..') ||
    !file.endsWith('.astro') ||
    !/^[a-zA-Z0-9_\-./]+$/.test(file)
  ) {
    return c.json({ success: false, error: 'Invalid file path' }, 400);
  }

  if (!await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id)) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  try {
    // Array form — no shell involved, safe against metacharacter injection
    const result = await sm.execInSandbox(sessionId, ['cat', `/workspace/${file}`], {
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
  const user = c.get('user') as User;
  const siteId = c.req.param('id');
  const body = await c.req.json();
  const parsed = CommitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  if (!await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id)) {
    return c.json({ success: false, error: 'Site not found' }, 404);
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
  const user = c.get('user') as User;
  const siteId = c.req.param('id');
  if (!await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id)) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }
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

// Read a file from the agency sandbox
agencyRoutes.get('/sites/:id/file', async (c) => {
  const user = c.get('user') as User;
  const siteId = c.req.param('id');
  const filePath = c.req.query('path');

  if (!filePath) {
    return c.json({ success: false, error: 'path is required' }, 400);
  }

  // Reject absolute paths and traversal — always serve from /workspace
  if (filePath.startsWith('/') || filePath.includes('..')) {
    return c.json({ success: false, error: 'Invalid path' }, 400);
  }
  const safePath = `/workspace/${filePath}`;

  const site = await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id);
  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  const content = await sm.readFile(sessionId, safePath);
  if (content === null) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  return c.json({ success: true, data: { content, path: safePath } });
});

// Write a file to the agency sandbox
agencyRoutes.put('/sites/:id/file', async (c) => {
  const user = c.get('user') as User;
  const siteId = c.req.param('id');

  const body = await c.req.json().catch(() => null);
  const filePath: string = body?.path;
  const content: string = body?.content;

  if (!filePath || content === undefined) {
    return c.json({ success: false, error: 'path and content are required' }, 400);
  }

  // Reject absolute paths and traversal — always write into /workspace
  if (filePath.startsWith('/') || filePath.includes('..')) {
    return c.json({ success: false, error: 'Invalid path' }, 400);
  }
  const safePath = `/workspace/${filePath}`;

  const site = await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id);
  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  const ok = await sm.writeFile(sessionId, safePath, content);
  if (!ok) {
    return c.json({ success: false, error: 'Write failed' }, 500);
  }

  return c.json({ success: true, data: { path: safePath } });
});

// Push changes to remote — triggers CF Pages or similar deploy
agencyRoutes.post('/sites/:id/push', async (c) => {
  const user = c.get('user') as User;
  const siteId = c.req.param('id');
  const site = await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id);

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

// Debug endpoint — analyze a screenshot with AI vision to diagnose styling issues.
// Accepts JSON { image: base64string, mediaType: string, context: string }.
// Uses Claude or Gemini via the AI SDK (requires an API key in Settings > AI Providers).
agencyRoutes.post('/sites/:id/debug', async (c) => {
  const user = c.get('user') as User;
  const body = await c.req.json().catch(() => null);
  if (!body?.image) {
    return c.json({ success: false, error: 'image required' }, 400);
  }

  const { image, mediaType = 'image/png', context = '' } = body as {
    image: string;
    mediaType?: string;
    context?: string;
  };

  const creds = await getProviderCredentials(c.env.SESSIONS_KV, user.id);
  const provider = creds.claude ? 'claude' : creds.gemini ? 'gemini' : null;

  if (!provider) {
    return c.json({
      success: false,
      error: 'Debug analysis requires a Claude or Gemini API key. Add one in Settings > AI Providers.',
    }, 400);
  }

  let aiModel;
  try {
    aiModel = createModel(provider, creds, provider === 'claude' ? 'haiku' : 'flash');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Model error';
    return c.json({ success: false, error: msg }, 400);
  }

  const systemPrompt = [
    'You are a CSS and frontend debugging expert.',
    'Analyze the provided screenshot for styling issues.',
    'Focus on: CSS specificity conflicts, Tailwind overrides, color inheritance, layout problems.',
    'Be specific — name the CSS class or rule causing the issue.',
    'Suggest the minimal fix: either use Tailwind !important prefix (e.g. !text-cyan-500)',
    'or edit the conflicting CSS class directly.',
    'Keep your response concise and actionable.',
  ].join(' ');

  const userContent: Array<{ type: 'image'; image: string; mimeType: string } | { type: 'text'; text: string }> = [
    { type: 'image', image, mimeType: mediaType },
  ];
  if (context) {
    userContent.push({ type: 'text', text: context });
  } else {
    userContent.push({ type: 'text', text: 'Analyze this screenshot for CSS/styling issues.' });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const write = (data: Record<string, unknown>) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const streamPromise = (async () => {
    try {
      await write({ type: 'connected' });
      const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      for await (const chunk of result.textStream) {
        await write({ type: 'text', text: chunk });
      }
      await write({ type: 'done' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis error';
      await write({ type: 'error', error: msg });
    } finally {
      await writer.close();
    }
  })();

  c.executionCtx.waitUntil(streamPromise);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
});

// Inline AI — streams CSS/HTML generation directly into the editor (no agent, no tools)
agencyRoutes.post('/sites/:id/inline-ai', async (c) => {
  const user = c.get('user') as User;
  const siteId = c.req.param('id');

  const body = await c.req.json().catch(() => null);
  const prompt: string = body?.prompt;
  const cssContext: string = body?.cssContext ?? '';
  const astroContext: string = body?.astroContext ?? '';
  const targetPane: 'css' | 'astro' = body?.targetPane ?? 'css';
  const elementContext: string = body?.elementContext ?? '';

  if (!prompt) {
    return c.json({ success: false, error: 'prompt is required' }, 400);
  }

  const site = await getOwnedSite(c.env.SESSIONS_KV, siteId, user.id);
  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const creds = await getProviderCredentials(c.env.SESSIONS_KV, user.id);

  let aiModel;
  try {
    if (creds.gemini) {
      aiModel = createModel('gemini', creds, 'flash');
    } else if (creds.claude) {
      aiModel = createModel('claude', creds, 'haiku');
    } else {
      return c.json(
        { success: false, error: 'No AI provider configured. Add a Gemini or Claude API key in Settings > AI Providers.' },
        400,
      );
    }
  } catch {
    return c.json({ success: false, error: 'Failed to initialize AI model' }, 500);
  }

  const systemPrompt = targetPane === 'css'
    ? [
        'You are a CSS expert. Generate clean, minimal CSS for the user\'s request.',
        'Return ONLY the CSS code — no explanation, no markdown fences, no comments unless asked.',
        'Prefer modern CSS: custom properties, flexbox, grid, transitions.',
        elementContext ? `Target element context: ${elementContext}` : '',
      ].filter(Boolean).join('\n')
    : [
        'You are an Astro/HTML expert. Generate clean Astro/HTML markup for the user\'s request.',
        'Return ONLY the HTML/Astro code — no explanation, no markdown fences.',
        elementContext ? `Target element context: ${elementContext}` : '',
      ].filter(Boolean).join('\n');

  const userMessage = [
    prompt,
    cssContext ? `\n\nCurrent CSS:\n${cssContext.slice(0, 4000)}` : '',
    astroContext ? `\n\nCurrent Astro file:\n${astroContext.slice(0, 2000)}` : '',
  ].filter(Boolean).join('');

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const write = (data: Record<string, unknown>) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const streamPromise = (async () => {
    try {
      const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      for await (const chunk of result.textStream) {
        await write({ type: 'text', text: chunk });
      }
      await write({ type: 'done' });
    } catch (err) {
      await write({ type: 'error', error: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      await writer.close();
    }
  })();

  c.executionCtx.waitUntil(streamPromise);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
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

  // Ownership check — only the site owner can trigger edits
  const site = await env.SESSIONS_KV.get<AgencySite>(`${KV_PREFIX}${siteId}`, 'json');
  if (!site || site.userId !== user.id) {
    return Response.json({ success: false, error: 'Site not found' }, { status: 404 });
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
    // Sanitize: reject absolute paths, traversal, and shell metacharacters
    const safeComponentFile = componentFile.replace(/\.\./g, '');
    if (
      !safeComponentFile.startsWith('/') &&
      /^[a-zA-Z0-9_\-./]+$/.test(safeComponentFile)
    ) {
      try {
        // Array form — no shell, safe against metacharacter injection
        const result = await sandboxManager.execInSandbox(
          sessionId,
          ['cat', `/workspace/${safeComponentFile}`],
        );
        fileSource = (result.stdout || '').slice(0, 6000);
      } catch {
        // File source is optional
      }
    }
  }

  // When instruction involves colors/styles, read CSS files to catch specificity conflicts
  let cssContext = '';
  const colorKeywords = ['color', 'text-', 'bg-', 'background', 'gradient', 'fill', 'stroke'];
  const isColorTask = colorKeywords.some(k => instruction.toLowerCase().includes(k));
  if (isColorTask && !siteWide) {
    try {
      const cssCmd = [
        'for f in $(find /workspace/src/styles /workspace/src/css /workspace/public',
        '-name "*.css" 2>/dev/null | head -4);',
        'do echo "=== $f ==="; cat "$f"; echo; done',
      ].join(' ');
      const cssResult = await sandboxManager.execInSandbox(sessionId, cssCmd);
      cssContext = (cssResult.stdout || '').slice(0, 3000);
    } catch {
      // CSS context is optional
    }
  }

  // CSS specificity rules — critical for Tailwind utilities vs explicit CSS class declarations
  const CSS_SPECIFICITY_RULES = [
    '- CSS specificity: Tailwind utilities can be overridden by explicit .class { color: ... } rules in stylesheets',
    '- Before adding a color/style Tailwind class, check if the element has a CSS class with explicit color rules',
    '- Use grep to check: grep -rn "class-name" /workspace/src/styles/',
    '- When a Tailwind utility is overridden by specificity, use ! prefix: !text-cyan-500 (generates color:... !important)',
    '- Prefer editing the existing CSS rule directly when it exists in a stylesheet (cleaner than fighting specificity)',
  ];

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
        ...CSS_SPECIFICITY_RULES,
        ...(cssContext ? ['', 'CSS files:', cssContext] : []),
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
        ...CSS_SPECIFICITY_RULES,
        ...(cssContext ? ['', 'Relevant CSS files:', cssContext] : []),
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

  console.log(`[agency/ws] handler called: siteId=${siteId}, hasToken=${!!user.claudeToken}`);

  if (!siteId) {
    console.log(`[agency/ws] missing siteId`);
    return new Response('Missing siteId', { status: 400 });
  }
  if (!user.claudeToken || !user.claudeToken.startsWith('sk-ant-oat01-')) {
    console.log(`[agency/ws] invalid token type — not OAuth`);
    return new Response('Agency mode requires a Claude OAuth token', { status: 401 });
  }

  // Ownership check — only the site owner can connect
  const site = await env.SESSIONS_KV.get<AgencySite>(`${KV_PREFIX}${siteId}`, 'json');
  if (!site || site.userId !== user.id) {
    console.log(`[agency/ws] ownership check failed for siteId=${siteId}`);
    return new Response('Site not found', { status: 404 });
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
