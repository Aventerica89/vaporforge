import { Hono } from 'hono';
import { z } from 'zod';
import { validateComponentEdit } from '../services/agency-validator';
import type { SandboxManager } from '../sandbox';
import type { User } from '../types';

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

// Edit a component via AI — writes scoped context for the WS agent
const EditComponentSchema = z.object({
  componentFile: z.string().nullable(),
  instruction: z.string().min(1).max(2000),
  siteWide: z.boolean().optional(),
});

agencyRoutes.post('/sites/:id/edit-component', async (c) => {
  const siteId = c.req.param('id');
  const body = await c.req.json();
  const parsed = EditComponentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const { componentFile, instruction, siteWide } = parsed.data;
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  // Read original file for post-edit validation (if component-scoped)
  let originalContent: string | null = null;
  if (componentFile) {
    originalContent = await sm.readFile(
      sessionId,
      `/workspace/${componentFile}`,
    );
  }

  // Build scoped system prompt
  const systemPrompt = siteWide
    ? [
        'You are editing a website theme.',
        'Modify ONLY CSS custom properties in the styles directory.',
        'Do not change component files.',
      ].join(' ')
    : [
        `You are editing a single Astro component: ${componentFile}`,
        'Rules:',
        '- Edit ONLY this file',
        '- Preserve data-vf-component and data-vf-file attributes',
        '- Use ONLY CSS custom properties (var(--*)) for colors, spacing, typography',
        '- Do NOT add hardcoded hex colors, pixel values, or font names',
        '- Preserve the Astro frontmatter (--- block) structure',
        '- Keep the component functional and valid',
      ].join('\n');

  // Write context file for WS agent to pick up
  await sm.writeContextFile(sessionId, {
    prompt: instruction,
    sessionId,
    cwd: '/workspace',
    env: {
      VF_AGENCY_MODE: '1',
      VF_SYSTEM_PROMPT: systemPrompt,
    },
  });

  // Post-edit validation: read the modified file and check invariants
  // This runs after a short delay to let the agent finish
  if (componentFile && originalContent) {
    c.executionCtx.waitUntil(
      (async () => {
        // Wait for agent to finish editing (best-effort timing)
        await new Promise((r) => setTimeout(r, 15_000));
        const modified = await sm.readFile(
          sessionId,
          `/workspace/${componentFile}`,
        );
        if (modified) {
          const componentName = componentFile
            .split('/')
            .pop()
            ?.replace('.astro', '') ?? '';
          const result = validateComponentEdit(
            originalContent,
            modified,
            componentName,
          );
          if (!result.valid) {
            console.warn(
              `[agency] Validation failed for ${componentFile}:`,
              result.errors,
            );
          }
        }
      })(),
    );
  }

  return c.json({ success: true });
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
    // Stat summary of changes
    const statResult = await sm.execInSandbox(sessionId, 'git diff --stat', {
      cwd: '/workspace',
    });

    // Full diff
    const fullResult = await sm.execInSandbox(sessionId, 'git diff', {
      cwd: '/workspace',
    });

    return c.json({
      success: true,
      data: {
        summary: statResult.stdout,
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
