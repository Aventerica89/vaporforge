# Agency Mode Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin-only visual editor inside VaporForge for click-to-edit AI editing of agency client sites using the agency-starter component library.

**Architecture:** Admin-gated routes + KV-backed dashboard + iframe preview via exposePort + inspector overlay with postMessage + Claude SDK via existing WebSocket pipeline + auto-commit to staging branch.

**Tech Stack:** Cloudflare Workers (Hono), CF Sandboxes (exposePort + wsConnect), React 18 + Zustand, Astro 5 (agency-starter), CSS custom properties

**Repo:** ~/vaporforge (branch: main)

---

## Component Pattern Reference

The agency-starter repo at `~/agency-starter` contains Astro components with:
- `data-vf-component="ComponentName"` attribute on the root section element
- `data-vf-file="src/components/category/ComponentName.astro"` attribute
- BEM-style CSS using ONLY CSS custom properties from `theme.css`
- TypeScript Props interfaces in frontmatter

The inspector overlay targets `[data-vf-component]` elements to enable click-to-edit.

### Key VaporForge Files

| File | Purpose |
|------|---------|
| `src/types.ts:130` | `UserSchema` — needs `role` field |
| `src/types.ts:140` | `AuthTokenPayload` — needs `role` in JWT |
| `src/auth.ts:276` | `extractAuth()` — returns User or null |
| `src/router.ts:41` | `createRouter()` — route registration |
| `src/sandbox.ts:586` | `wsConnectToSandbox()` — WS proxy |
| `ui/src/hooks/useAuth.ts` | Auth Zustand store — needs `isAdmin` |
| `ui/src/lib/types.ts:92` | Frontend `User` interface — needs `role` |
| `ui/src/components/Layout.tsx` | Overlay pattern (`settingsOpen`, `marketplaceOpen`) |

---

## Task 1: Validate exposePort (Critical Risk Gate)

**Files:**
- Create: `scripts/test-expose-port.ts` (temporary test script)

**Why this is first:** The entire visual editor depends on `sandbox.exposePort()` working to load the Astro dev server in an iframe. If this doesn't work, we need a fundamentally different architecture. Everything else waits on this.

**Step 1: Write a minimal test script**

Create `scripts/test-expose-port.ts`:

```typescript
/**
 * Test script to validate CF Sandbox exposePort works.
 * Run via: npx wrangler dev, then hit /api/test-expose-port
 */

import { Hono } from 'hono';

// This will be a temporary route added to router.ts
// Test flow:
// 1. Create a sandbox
// 2. Start a simple HTTP server on port 4321 inside it
// 3. Call sandbox.exposePort(4321)
// 4. Return the preview URL
// 5. Manually verify the URL loads in browser

export async function testExposePort(
  sandbox: any // Sandbox instance
): Promise<{ url: string; port: number } | null> {
  try {
    // Start a simple HTTP server inside the container
    await sandbox.exec('node', [
      '-e',
      'require("http").createServer((q,s)=>{s.writeHead(200,{"Content-Type":"text/html"});s.end("<h1>exposePort works!</h1>")}).listen(4321)'
    ]);

    // Wait for server to start
    await new Promise(r => setTimeout(r, 1000));

    // Try exposePort
    const result = await sandbox.exposePort(4321);
    return result;
  } catch (error) {
    console.error('exposePort test failed:', error);
    return null;
  }
}
```

**Step 2: Add temporary test route to router.ts**

Add after the health check route (line ~120):

```typescript
// TEMPORARY: Test exposePort — remove after validation
app.get('/api/test-expose-port', async (c) => {
  const user = await extractAuth(c.req.raw, c.get('authService'));
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const sm = c.get('sandboxManager');
  // Use any active session's sandbox
  // Or create a temporary one
  try {
    const sandbox = sm.getSandboxInstance('test-expose');
    const result = await sandbox.exposePort(4321);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
      message: 'exposePort is not available or failed'
    });
  }
});
```

**Step 3: Test manually**

```bash
cd ~/vaporforge
npm run dev
# In another terminal, after logging in:
curl -H "Authorization: Bearer <your-jwt>" http://localhost:8787/api/test-expose-port
```

**Expected outcomes:**
- **SUCCESS**: Returns `{ success: true, data: { url: "https://...", port: 4321 } }` — proceed with plan
- **FAILURE**: Returns error — STOP and reassess architecture. Possible fallback: reverse proxy through Worker using fetch to container IP (if accessible), or use wsConnect with a custom HTTP-over-WS bridge.

**Step 4: Clean up**

Remove the test route and script after validation:

```bash
rm scripts/test-expose-port.ts
# Revert the temporary route in router.ts
git checkout src/router.ts
```

**Step 5: Document result**

If exposePort works, note the returned URL format and any options/limitations discovered. If it requires specific options, document them for Task 5.

**No commit for this task** — it's exploratory validation only.

---

## Task 2: Admin Role + Middleware

**Files:**
- Modify: `src/types.ts:130-145` (UserSchema + AuthTokenPayload)
- Modify: `src/auth.ts` (add requireAdmin, update JWT generation)
- Modify: `ui/src/lib/types.ts:92-96` (frontend User interface)
- Modify: `ui/src/hooks/useAuth.ts` (add isAdmin derived state)

### Update Backend Types

**`src/types.ts` — Add role to UserSchema (line 130):**

```typescript
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  claudeToken: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.string(),
});
```

**`src/types.ts` — Add role to AuthTokenPayload (line 140):**

```typescript
export const AuthTokenPayload = z.object({
  sub: z.string(),
  email: z.string(),
  role: z.enum(['user', 'admin']).default('user'),
  iat: z.number(),
  exp: z.number(),
});
```

### Update Auth Service

**`src/auth.ts` — Update JWT generation to include role.**

Find where the JWT payload is created (in `generateToken` or similar method) and add `role: user.role || 'user'` to the payload.

**`src/auth.ts` — Add requireAdmin middleware after `extractAuth` (after line 299):**

```typescript
// Admin-only middleware — returns 404 (not 403) to hide existence
export async function requireAdmin(
  request: Request,
  authService: AuthService
): Promise<User | Response> {
  const user = await extractAuth(request, authService);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check role from KV user record
  const kvUser = await authService.getUser(user.id);
  if (!kvUser || kvUser.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return kvUser;
}
```

### Update Frontend Types

**`ui/src/lib/types.ts` — Add role to User interface (line 92):**

```typescript
export interface User {
  id: string;
  email: string;
  name?: string;
  role?: 'user' | 'admin';
}
```

### Update Auth Store

**`ui/src/hooks/useAuth.ts` — Decode role from JWT, expose `isAdmin`:**

In the `checkAuth` method, where the JWT payload is decoded (line ~43-48), also extract `role`:

```typescript
if (payload.sub) userId = payload.sub;
if (payload.email) email = payload.email;
const role = payload.role || 'user';
```

Update the `set` call to include role:

```typescript
set({
  isAuthenticated: true,
  isLoading: false,
  user: { id: userId, email, role },
});
```

Add `isAdmin` as a derived getter to the store interface and compute it:

```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;  // NEW
  isLoading: boolean;
  error: string | null;
  // ...
}
```

Compute `isAdmin` wherever `user` is set:

```typescript
const isAdmin = role === 'admin';
set({
  isAuthenticated: true,
  isLoading: false,
  isAdmin,
  user: { id: userId, email, role },
});
```

### Set Admin Role Manually

One-time KV write to set your account as admin:

```bash
npx wrangler kv:key put --binding AUTH_KV "user:<your-user-id>" \
  '{"id":"<your-user-id>","email":"<your-email>","role":"admin","createdAt":"2026-01-01T00:00:00Z"}'
```

**Commit:**

```bash
git add src/types.ts src/auth.ts ui/src/lib/types.ts ui/src/hooks/useAuth.ts
git commit -m "feat: add admin role to user schema and requireAdmin middleware"
```

---

## Task 3: Agency Site CRUD API

**Files:**
- Create: `src/api/agency.ts`
- Modify: `src/router.ts` (mount agency routes)

### Create Agency Routes

**`src/api/agency.ts`:**

```typescript
import { Hono } from 'hono';
import { requireAdmin } from '../auth';
import { z } from 'zod';
import type { User } from '../types';

type Bindings = {
  AUTH_KV: KVNamespace;
  SESSIONS_KV: KVNamespace;
};

type Variables = {
  user: User;
  authService: any;
  sandboxManager: any;
};

const AgencySiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoUrl: z.string().url(),
  pagesUrl: z.string().url().optional(),
  domain: z.string().optional(),
  lastEdited: z.string().optional(),
  thumbnail: z.string().optional(),
  status: z.enum(['live', 'staging', 'building']).default('live'),
});

type AgencySite = z.infer<typeof AgencySiteSchema>;

const KV_PREFIX = 'agency-site:';

export const agencyRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// Admin gate on ALL agency routes
agencyRoutes.use('*', async (c, next) => {
  const result = await requireAdmin(c.req.raw, c.get('authService'));
  if (result instanceof Response) return result;
  c.set('user', result);
  await next();
});

// List all agency sites
agencyRoutes.get('/sites', async (c) => {
  const kv = c.env.SESSIONS_KV;
  const list = await kv.list({ prefix: KV_PREFIX });
  const sites: AgencySite[] = [];

  for (const key of list.keys) {
    const value = await kv.get(key.name, 'json');
    if (value) sites.push(value as AgencySite);
  }

  // Sort by lastEdited descending
  sites.sort((a, b) =>
    (b.lastEdited || '').localeCompare(a.lastEdited || '')
  );

  return c.json({ success: true, data: sites });
});

// Get single site
agencyRoutes.get('/sites/:id', async (c) => {
  const site = await c.env.SESSIONS_KV.get(
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
  const id = crypto.randomUUID().slice(0, 8);

  const site: AgencySite = {
    id,
    name: body.name,
    repoUrl: body.repoUrl,
    pagesUrl: body.pagesUrl || '',
    domain: body.domain || '',
    lastEdited: new Date().toISOString(),
    thumbnail: '',
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
  const existing = await c.env.SESSIONS_KV.get(
    `${KV_PREFIX}${id}`,
    'json'
  ) as AgencySite | null;

  if (!existing) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const body = await c.req.json();
  const updated: AgencySite = {
    ...existing,
    ...body,
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
  await c.env.SESSIONS_KV.delete(`${KV_PREFIX}${id}`);
  return c.json({ success: true });
});
```

### Mount Routes

**`src/router.ts` — Add import and mount:**

After the existing imports (around line 27):

```typescript
import { agencyRoutes } from './api/agency';
```

Mount the routes where other route groups are mounted (look for `api.route(...)` calls):

```typescript
api.route('/agency', agencyRoutes);
```

**Commit:**

```bash
git add src/api/agency.ts src/router.ts
git commit -m "feat: add agency site CRUD API with admin-only middleware"
```

---

## Task 4: Agency Dashboard Frontend

**Files:**
- Create: `ui/src/hooks/useAgencyStore.ts`
- Create: `ui/src/components/agency/AgencyDashboard.tsx`
- Modify: `ui/src/components/Layout.tsx` (add agency overlay toggle)

### Create Agency Store

**`ui/src/hooks/useAgencyStore.ts`:**

```typescript
import { create } from 'zustand';
import { api } from '@/lib/api';

export interface AgencySite {
  id: string;
  name: string;
  repoUrl: string;
  pagesUrl?: string;
  domain?: string;
  lastEdited?: string;
  thumbnail?: string;
  status: 'live' | 'staging' | 'building';
}

interface AgencyState {
  sites: AgencySite[];
  isLoading: boolean;
  error: string | null;
  dashboardOpen: boolean;
  editorOpen: boolean;
  editingSiteId: string | null;
  previewUrl: string | null;

  // Actions
  openDashboard: () => void;
  closeDashboard: () => void;
  fetchSites: () => Promise<void>;
  createSite: (data: {
    name: string;
    repoUrl: string;
    pagesUrl?: string;
  }) => Promise<AgencySite>;
  deleteSite: (id: string) => Promise<void>;
  openEditor: (siteId: string) => void;
  closeEditor: () => void;
  setPreviewUrl: (url: string | null) => void;
}

export const useAgencyStore = create<AgencyState>((set, get) => ({
  sites: [],
  isLoading: false,
  error: null,
  dashboardOpen: false,
  editorOpen: false,
  editingSiteId: null,
  previewUrl: null,

  openDashboard: () => set({ dashboardOpen: true }),
  closeDashboard: () => set({ dashboardOpen: false }),

  fetchSites: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/agency/sites', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch sites');
      const json = await res.json();
      set({ sites: json.data, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed',
        isLoading: false,
      });
    }
  },

  createSite: async (data) => {
    const token = localStorage.getItem('session_token');
    const res = await fetch('/api/agency/sites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create site');
    const json = await res.json();
    const site = json.data as AgencySite;
    set((s) => ({ sites: [site, ...s.sites] }));
    return site;
  },

  deleteSite: async (id) => {
    const token = localStorage.getItem('session_token');
    await fetch(`/api/agency/sites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    set((s) => ({ sites: s.sites.filter((site) => site.id !== id) }));
  },

  openEditor: (siteId) =>
    set({
      editorOpen: true,
      dashboardOpen: false,
      editingSiteId: siteId,
    }),

  closeEditor: () =>
    set({
      editorOpen: false,
      editingSiteId: null,
      previewUrl: null,
    }),

  setPreviewUrl: (url) => set({ previewUrl: url }),
}));
```

### Create Dashboard Component

**`ui/src/components/agency/AgencyDashboard.tsx`:**

A full-screen overlay (same pattern as SettingsPage) showing a grid of agency site cards. Each card shows site name, status badge, last edited date, and Edit/View Live buttons.

Key elements:
- Fetch sites on mount via `useAgencyStore().fetchSites()`
- "New Site" button opens a simple form modal (name + repoUrl)
- "Edit" button calls `openEditor(siteId)`
- Status badges: Live (green), Staging (amber), Building (blue)
- Follows existing VaporForge overlay pattern with close button top-right

### Update Layout.tsx

**`ui/src/components/Layout.tsx`:**

Import useAgencyStore and useAuthStore, conditionally render:

```typescript
const { isAdmin } = useAuthStore();
const { dashboardOpen, editorOpen } = useAgencyStore();

// In the overlay section (where settingsOpen and marketplaceOpen are checked):
if (isAdmin && dashboardOpen) {
  return <AgencyDashboard />;
}
if (isAdmin && editorOpen) {
  return <AgencyEditor />;  // Task 7
}
```

Add an "Agency" button to the nav/sidebar, visible only when `isAdmin` is true.

**Commit:**

```bash
git add ui/src/hooks/useAgencyStore.ts ui/src/components/agency/AgencyDashboard.tsx ui/src/components/Layout.tsx
git commit -m "feat: add agency dashboard with site grid and admin-only nav"
```

---

## Task 5: Container Setup + exposePort

**Files:**
- Modify: `src/sandbox.ts` (add `startAgencySession` method)
- Modify: `src/api/agency.ts` (add `/sites/:id/edit` endpoint)

### Add Agency Session Method to SandboxManager

**`src/sandbox.ts` — Add new method:**

```typescript
// Start an agency editing session:
// 1. Create/resume sandbox with the site's repo
// 2. Install deps + start astro dev on port 4321
// 3. Expose port 4321 for iframe preview
// 4. Return preview URL
async startAgencySession(
  siteId: string,
  repoUrl: string,
  branch: string = 'staging'
): Promise<{ previewUrl: string; sessionId: string }> {
  const sessionId = `agency-${siteId}`;
  const sandbox = this.getSandboxInstance(sessionId);

  // Clone repo and checkout staging branch
  await sandbox.exec('git', [
    'clone', '--branch', branch, repoUrl, '/workspace'
  ]);

  // Install dependencies
  await sandbox.exec('npm', ['install'], { cwd: '/workspace' });

  // Start astro dev in background on port 4321
  await sandbox.startProcess('astro-dev', 'npm', ['run', 'dev'], {
    cwd: '/workspace',
    env: { HOST: '0.0.0.0', PORT: '4321' },
  });

  // Wait for server to start
  await new Promise(r => setTimeout(r, 3000));

  // Expose port for iframe
  const preview = await sandbox.exposePort(4321);

  return {
    previewUrl: preview.url,
    sessionId,
  };
}
```

**Note:** The exact `exposePort` API shape will be confirmed by Task 1. Adjust parameters as needed based on validation results.

### Add Edit Endpoint

**`src/api/agency.ts` — Add edit session endpoint:**

```typescript
// Start editing session for a site
agencyRoutes.post('/sites/:id/edit', async (c) => {
  const id = c.req.param('id');
  const site = await c.env.SESSIONS_KV.get(
    `${KV_PREFIX}${id}`,
    'json'
  ) as AgencySite | null;

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');

  try {
    const result = await sm.startAgencySession(id, site.repoUrl);

    // Update site status
    const updated = {
      ...site,
      status: 'staging' as const,
      lastEdited: new Date().toISOString(),
    };
    await c.env.SESSIONS_KV.put(
      `${KV_PREFIX}${id}`,
      JSON.stringify(updated)
    );

    return c.json({
      success: true,
      data: {
        previewUrl: result.previewUrl,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: `Failed to start editing session: ${String(error)}`,
    }, 500);
  }
});
```

**Commit:**

```bash
git add src/sandbox.ts src/api/agency.ts
git commit -m "feat: add agency session with exposePort preview URL"
```

---

## Task 6: Inspector Overlay (agency-starter side)

**Files:**
- Create: `~/agency-starter/public/vf-inspector.js`
- Create: `~/agency-starter/src/integrations/vf-inspector.ts`
- Modify: `~/agency-starter/astro.config.mjs` (add integration)

### Create Inspector Script

**`~/agency-starter/public/vf-inspector.js`:**

```javascript
// VaporForge Inspector Overlay
// Injected in dev mode only. Enables click-to-edit in iframe.
(function() {
  // Only run inside iframe
  if (window === window.top) return;

  // Create overlay elements
  const hoverOverlay = document.createElement('div');
  hoverOverlay.id = 'vf-hover-overlay';
  Object.assign(hoverOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #3b82f6',
    borderRadius: '4px',
    zIndex: '99999',
    display: 'none',
    transition: 'all 0.15s ease',
  });

  const selectOverlay = document.createElement('div');
  selectOverlay.id = 'vf-select-overlay';
  Object.assign(selectOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #8b5cf6',
    borderRadius: '4px',
    zIndex: '99998',
    display: 'none',
    boxShadow: '0 0 0 4px rgba(139,92,246,0.2)',
  });

  const label = document.createElement('div');
  label.id = 'vf-label';
  Object.assign(label.style, {
    position: 'fixed',
    pointerEvents: 'none',
    background: '#3b82f6',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '100000',
    display: 'none',
    whiteSpace: 'nowrap',
  });

  document.body.appendChild(hoverOverlay);
  document.body.appendChild(selectOverlay);
  document.body.appendChild(label);

  let selectedComponent = null;

  function findVfParent(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.hasAttribute &&
          node.hasAttribute('data-vf-component')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function positionOverlay(overlay, rect) {
    Object.assign(overlay.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      display: 'block',
    });
  }

  // Hover: show blue outline
  document.addEventListener('mousemove', (e) => {
    const comp = findVfParent(e.target);
    if (comp && comp !== selectedComponent) {
      const rect = comp.getBoundingClientRect();
      positionOverlay(hoverOverlay, rect);
      label.textContent = comp.getAttribute('data-vf-component');
      label.style.top = (rect.top - 24) + 'px';
      label.style.left = rect.left + 'px';
      label.style.display = 'block';
    } else if (!comp) {
      hoverOverlay.style.display = 'none';
      label.style.display = 'none';
    }
  });

  // Click: select component
  document.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const comp = findVfParent(e.target);
    if (comp) {
      selectedComponent = comp;
      const rect = comp.getBoundingClientRect();
      positionOverlay(selectOverlay, rect);
      hoverOverlay.style.display = 'none';

      window.parent.postMessage({
        type: 'vf-select',
        component: comp.getAttribute('data-vf-component'),
        file: comp.getAttribute('data-vf-file'),
        boundingRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      }, '*');
    } else {
      // Click empty space = deselect
      selectedComponent = null;
      selectOverlay.style.display = 'none';
      window.parent.postMessage({ type: 'vf-deselect' }, '*');
    }
  }, true);

  // Report component tree on load
  function reportTree() {
    const components = [];
    document.querySelectorAll('[data-vf-component]').forEach((el) => {
      components.push({
        component: el.getAttribute('data-vf-component'),
        file: el.getAttribute('data-vf-file'),
      });
    });
    window.parent.postMessage({
      type: 'vf-tree',
      components,
    }, '*');
  }

  // Report on load and after HMR updates
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportTree);
  } else {
    reportTree();
  }

  // Re-report after Astro HMR
  if (import.meta.hot) {
    import.meta.hot.on('astro:update', () => {
      setTimeout(reportTree, 500);
    });
  }
})();
```

### Create Astro Integration

**`~/agency-starter/src/integrations/vf-inspector.ts`:**

```typescript
import type { AstroIntegration } from 'astro';

export default function vfInspector(): AstroIntegration {
  return {
    name: 'vf-inspector',
    hooks: {
      'astro:config:setup': ({ command, injectScript }) => {
        if (command === 'dev') {
          injectScript(
            'page',
            `import '/vf-inspector.js';`
          );
        }
      },
    },
  };
}
```

### Update Astro Config

**`~/agency-starter/astro.config.mjs`:**

Add the integration to the integrations array:

```javascript
import vfInspector from './src/integrations/vf-inspector';

export default defineConfig({
  integrations: [
    vfInspector(),
    // ... other integrations
  ],
});
```

**Commit (in agency-starter repo):**

```bash
cd ~/agency-starter
git add public/vf-inspector.js src/integrations/vf-inspector.ts astro.config.mjs
git commit -m "feat: add VaporForge inspector overlay for click-to-edit"
git push
```

---

## Task 7: Visual Editor Frontend

**Files:**
- Create: `ui/src/components/agency/AgencyEditor.tsx`
- Create: `ui/src/components/agency/EditPanel.tsx`
- Create: `ui/src/components/agency/ComponentTree.tsx`

### AgencyEditor — Three Panel Layout

**`ui/src/components/agency/AgencyEditor.tsx`:**

Three-panel layout:
- Left: ComponentTree (collapsible sidebar, ~200px)
- Center: iframe preview (flex-1)
- Right: EditPanel (~320px)

Key behaviors:
- On mount: call `/api/agency/sites/:id/edit` to start container + get previewUrl
- Set iframe src to previewUrl
- Listen for `postMessage` events from iframe (vf-select, vf-deselect, vf-tree)
- Validate `event.origin` before processing messages
- Pass selected component info to EditPanel
- Pass component list to ComponentTree
- Close button returns to dashboard

```typescript
// Simplified structure
function AgencyEditor() {
  const { editingSiteId, closeEditor, setPreviewUrl, previewUrl } =
    useAgencyStore();
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [componentTree, setComponentTree] = useState([]);
  const [treeVisible, setTreeVisible] = useState(true);
  const iframeRef = useRef(null);

  // Start editing session on mount
  useEffect(() => {
    if (!editingSiteId) return;
    startSession(editingSiteId);
  }, [editingSiteId]);

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(event) {
      // Validate origin against known preview URL domain
      const data = event.data;
      if (data.type === 'vf-select') {
        setSelectedComponent({
          component: data.component,
          file: data.file,
        });
      } else if (data.type === 'vf-deselect') {
        setSelectedComponent(null);
      } else if (data.type === 'vf-tree') {
        setComponentTree(data.components);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex">
      {/* Component Tree (collapsible left sidebar) */}
      {treeVisible && (
        <ComponentTree
          components={componentTree}
          selectedComponent={selectedComponent?.component}
          onSelect={(comp) => {
            // Click tree item = same as clicking in iframe
            setSelectedComponent(comp);
          }}
        />
      )}

      {/* Center: iframe preview */}
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 h-10
          bg-zinc-900 flex items-center px-3 gap-2 z-10">
          {/* Toolbar: toggle tree, viewport size, escape hatch */}
          <button onClick={() => setTreeVisible(!treeVisible)}>
            Tree
          </button>
          <button onClick={closeEditor}>
            Close
          </button>
        </div>
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full pt-10"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full
            text-zinc-400">
            Starting preview server...
          </div>
        )}
      </div>

      {/* Edit Panel (right sidebar) */}
      <EditPanel
        selectedComponent={selectedComponent}
        siteId={editingSiteId}
      />
    </div>
  );
}
```

### EditPanel — Component Chat + History

**`ui/src/components/agency/EditPanel.tsx`:**

Right sidebar showing:
- Selected component name + file path (or "Site-wide" if none selected)
- Chat input for edit instructions
- Edit history with undo capability

Uses existing `useWebSocket` hook to send edit instructions through the container's Claude SDK. System prompt scoped to the selected component file.

The message sent via WebSocket includes:
- `systemPrompt`: Scoped instructions ("Edit ONLY {file}. Preserve data-vf-* attributes. Use CSS custom properties only. Do not add hardcoded colors.")
- `prompt`: The user's edit instruction

### ComponentTree — Collapsible Left Sidebar

**`ui/src/components/agency/ComponentTree.tsx`:**

Scrollable list of components grouped by category (extracted from file path). Click selects the component (same as clicking in iframe).

**Commit:**

```bash
git add ui/src/components/agency/
git commit -m "feat: add visual editor with iframe preview, edit panel, component tree"
```

---

## Task 8: AI Edit Pipeline + Post-Edit Validation

**Files:**
- Modify: `src/api/agency.ts` (add edit + auto-commit endpoints)
- Create: `src/services/agency-validator.ts`

### Edit Endpoint

The edit endpoint sends a scoped message through the container's WS agent:

```typescript
// POST /api/agency/sites/:id/edit-component
agencyRoutes.post('/sites/:id/edit-component', async (c) => {
  const { componentFile, instruction, siteWide } = await c.req.json();
  const siteId = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;

  // Build scoped system prompt
  const systemPrompt = siteWide
    ? 'You are editing a website theme. Modify ONLY CSS custom properties in theme.css. Do not change component files.'
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

  // Write context file for WS agent
  await sm.writeContextFile(sessionId, {
    prompt: instruction,
    sessionId,
    cwd: '/workspace',
    env: {
      VF_AGENCY_MODE: '1',
      VF_SYSTEM_PROMPT: systemPrompt,
    },
  });

  // Return — the actual edit happens via WebSocket stream
  // Frontend handles WS connection same as main chat
  return c.json({ success: true });
});
```

### Post-Edit Validation

**`src/services/agency-validator.ts`:**

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateComponentEdit(
  originalContent: string,
  modifiedContent: string,
  componentName: string
): ValidationResult {
  const errors: string[] = [];

  // Check data-vf-component preserved
  if (!modifiedContent.includes(`data-vf-component="${componentName}"`)) {
    errors.push(
      `data-vf-component="${componentName}" attribute was removed`
    );
  }

  // Check data-vf-file preserved
  const fileMatch = originalContent.match(/data-vf-file="([^"]+)"/);
  if (fileMatch && !modifiedContent.includes(fileMatch[0])) {
    errors.push('data-vf-file attribute was removed or changed');
  }

  // Check for hardcoded hex colors in style block
  const styleMatch = modifiedContent.match(
    /<style[\s\S]*?>([\s\S]*?)<\/style>/
  );
  if (styleMatch) {
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const hexMatches = styleMatch[1].match(hexPattern);
    if (hexMatches) {
      errors.push(
        `Hardcoded colors found: ${hexMatches.slice(0, 3).join(', ')}. Use CSS custom properties.`
      );
    }
  }

  // Check frontmatter preserved
  const origFm = originalContent.match(/^---\n([\s\S]*?)\n---/);
  const modFm = modifiedContent.match(/^---\n([\s\S]*?)\n---/);
  if (origFm && !modFm) {
    errors.push('Astro frontmatter (--- block) was removed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Auto-Commit Endpoint

```typescript
// POST /api/agency/sites/:id/commit
agencyRoutes.post('/sites/:id/commit', async (c) => {
  const { componentName, instruction } = await c.req.json();
  const siteId = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;
  const sandbox = sm.getSandboxInstance(sessionId);

  const truncated = instruction.slice(0, 50);
  const message = `agency: Update ${componentName}: ${truncated}`;

  await sandbox.exec('git', ['add', '-A'], { cwd: '/workspace' });
  await sandbox.exec('git', ['commit', '-m', message], {
    cwd: '/workspace',
  });

  return c.json({ success: true, data: { message } });
});
```

**Commit:**

```bash
git add src/api/agency.ts src/services/agency-validator.ts
git commit -m "feat: add AI edit pipeline with scoped prompts and post-edit validation"
```

---

## Task 9: Staging Workflow (Diff + Push Live)

**Files:**
- Modify: `src/api/agency.ts` (add diff + push endpoints)

### Diff Endpoint

```typescript
// GET /api/agency/sites/:id/diff
// Returns git diff between staging and main
agencyRoutes.get('/sites/:id/diff', async (c) => {
  const siteId = c.req.param('id');
  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;
  const sandbox = sm.getSandboxInstance(sessionId);

  const result = await sandbox.exec('git', [
    'diff', 'main...staging', '--stat'
  ], { cwd: '/workspace' });

  const fullDiff = await sandbox.exec('git', [
    'diff', 'main...staging'
  ], { cwd: '/workspace' });

  return c.json({
    success: true,
    data: {
      summary: result.stdout,
      diff: fullDiff.stdout,
    },
  });
});
```

### Push Live Endpoint

```typescript
// POST /api/agency/sites/:id/push
// Pushes staging branch, which triggers CF Pages deploy
agencyRoutes.post('/sites/:id/push', async (c) => {
  const siteId = c.req.param('id');
  const site = await c.env.SESSIONS_KV.get(
    `${KV_PREFIX}${siteId}`,
    'json'
  ) as AgencySite | null;

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const sm = c.get('sandboxManager');
  const sessionId = `agency-${siteId}`;
  const sandbox = sm.getSandboxInstance(sessionId);

  try {
    // Push staging to remote
    await sandbox.exec('git', ['push', 'origin', 'staging'], {
      cwd: '/workspace',
    });

    // Merge staging into main
    await sandbox.exec('git', ['checkout', 'main'], {
      cwd: '/workspace',
    });
    await sandbox.exec('git', ['merge', 'staging'], {
      cwd: '/workspace',
    });
    await sandbox.exec('git', ['push', 'origin', 'main'], {
      cwd: '/workspace',
    });

    // Switch back to staging for continued editing
    await sandbox.exec('git', ['checkout', 'staging'], {
      cwd: '/workspace',
    });

    // Update site status
    const updated = {
      ...site,
      status: 'building' as const,
      lastEdited: new Date().toISOString(),
    };
    await c.env.SESSIONS_KV.put(
      `${KV_PREFIX}${siteId}`,
      JSON.stringify(updated)
    );

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: `Push failed: ${String(error)}`,
    }, 500);
  }
});
```

**Note:** Git push requires auth. The container needs a GitHub token with push access to the site's repo. This can be injected via environment variable during `startAgencySession` (use a personal access token stored in 1Password / Worker env).

**Commit:**

```bash
git add src/api/agency.ts
git commit -m "feat: add staging diff and push-live workflow"
```

---

## Task 10: Build + Deploy + E2E Test

**Files:**
- No new files — build, deploy, and test

**Step 1: Build**

```bash
cd ~/vaporforge
npm run build
```

Fix any TypeScript errors.

**Step 2: Deploy**

```bash
docker builder prune --all -f
npm run deploy
```

**Step 3: Manual E2E Test**

1. Log in to vaporforge.dev with admin account
2. Verify "Agency" button appears in nav (only for admin)
3. Log in with a non-admin account — verify zero evidence of Agency features
4. Back to admin: click Agency, verify dashboard loads
5. Add a test site (use agency-starter repo URL)
6. Click Edit — verify container starts and iframe loads
7. Click a component in the iframe — verify blue outline + selection
8. Type an edit instruction — verify Claude processes it
9. Verify HMR updates the preview
10. Check git log in container — verify auto-commit
11. Click "Push Live" — verify merge to main

**Step 4: Fix any issues discovered**

**Step 5: Final commit**

```bash
git add .
git commit -m "feat: Agency Mode v1 — admin-only visual editor for client sites"
git push
```

---

## Summary

After completing all 10 tasks:

- **Admin-only access** with role field and 404 responses for non-admins
- **Dashboard** with site grid, CRUD operations
- **Visual Editor** with iframe preview, click-to-select inspector, component tree
- **AI Edit Pipeline** using existing Claude SDK via WebSocket
- **Post-edit validation** preventing broken components
- **Auto-commit** every edit to staging branch
- **Push Live** workflow merging staging to main for CF Pages deploy
- **Zero VaporForge interference** — regular users see nothing

**Critical dependency:** Task 1 (exposePort validation) must succeed before Tasks 5-10 can proceed.
