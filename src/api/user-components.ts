import { Hono } from 'hono';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { User, ApiResponse } from '../types';
import { createModel, getProviderCredentials } from '../services/ai-provider-factory';

export interface UserComponentFile {
  path: string;
  content: string;
}

export interface UserComponentEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  code: string;
  dependencies: string[];
  tailwindClasses: string[];
  type?: 'snippet' | 'app';
  files?: UserComponentFile[];
  instructions?: string;
  setupScript?: string;
  agents?: string[];
  sourceUrl?: string;
  isCustom: true;
  createdAt: string;
}

type Variables = { user: User };

export const userComponentsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_COMPONENTS = 200;
const MAX_NAME_LENGTH = 80;
const KV_KEY = (userId: string) => `user-components:${userId}`;

async function getComponents(kv: KVNamespace, userId: string): Promise<UserComponentEntry[]> {
  const raw = await kv.get(KV_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UserComponentEntry[];
  } catch {
    return [];
  }
}

// GET /api/user-components
userComponentsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const components = await getComponents(c.env.SESSIONS_KV, user.id);
  return c.json<ApiResponse<UserComponentEntry[]>>({ success: true, data: components });
});

// POST /api/user-components
userComponentsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Omit<UserComponentEntry, 'id' | 'isCustom' | 'createdAt'>>();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Name is required' }, 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return c.json<ApiResponse<never>>(
      { success: false, error: `Name too long (max ${MAX_NAME_LENGTH} chars)` },
      400
    );
  }

  const type = body.type ?? 'snippet';
  if (type === 'snippet' && !body.code?.trim()) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Code is required for snippet type' }, 400);
  }
  if (type === 'app' && (!body.files || body.files.length === 0)) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Files are required for app type' }, 400);
  }

  const existing = await getComponents(c.env.SESSIONS_KV, user.id);
  if (existing.length >= MAX_COMPONENTS) {
    return c.json<ApiResponse<never>>(
      { success: false, error: `Maximum of ${MAX_COMPONENTS} components reached` },
      400
    );
  }

  const entry: UserComponentEntry = {
    id: crypto.randomUUID(),
    name,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'Custom',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    code: body.code ?? '',
    dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
    tailwindClasses: Array.isArray(body.tailwindClasses) ? body.tailwindClasses : [],
    type,
    ...(type === 'app' && body.files ? { files: body.files } : {}),
    ...(body.instructions ? { instructions: body.instructions } : {}),
    ...(body.setupScript ? { setupScript: body.setupScript } : {}),
    ...(Array.isArray(body.agents) && body.agents.length > 0 ? { agents: body.agents } : {}),
    ...(typeof body.sourceUrl === 'string' && body.sourceUrl.trim() ? { sourceUrl: body.sourceUrl.trim() } : {}),
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  const updated = [entry, ...existing];
  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(updated));

  return c.json<ApiResponse<UserComponentEntry>>({ success: true, data: entry });
});

// DELETE /api/user-components/:id
userComponentsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await getComponents(c.env.SESSIONS_KV, user.id);
  const updated = existing.filter((e) => e.id !== id);
  await c.env.SESSIONS_KV.put(KV_KEY(user.id), JSON.stringify(updated));

  return c.json<ApiResponse<{ id: string }>>({ success: true, data: { id } });
});

// POST /api/user-components/generate
// AI-powered component generation — returns a draft, does NOT save
const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(8000),
});

const GeneratedComponentSchema = z.object({
  name: z.string().describe('Short display name for the component'),
  category: z.string().describe('Category: Form, Layout, Data Display, Feedback, Navigation, Overlay, App Components, or Custom'),
  description: z.string().describe('One sentence describing what the component does'),
  type: z.enum(['snippet', 'app']).describe('snippet = single file; app = multi-file component'),
  code: z.string().describe('For snippet type: the full component code. For app type: leave empty string.'),
  files: z.array(z.object({
    path: z.string().describe('Relative path e.g. components/MyWidget.tsx'),
    content: z.string().describe('Full file content'),
  })).describe('For app type: array of files. For snippet type: empty array.'),
  dependencies: z.array(z.string()).describe('npm package names required (e.g. ["zustand", "lucide-react"])'),
  tailwindClasses: z.array(z.string()).describe('Notable Tailwind classes used'),
  instructions: z.string().describe('Optional: setup notes, usage guide, or caveats in plain text. Empty string if none.'),
  setupScript: z.string().describe('Optional: shell/npm command to run after copying files (e.g. "npm install && npx shadcn add button"). Empty string if none.'),
  agents: z.array(z.string()).describe('Optional: related agent slugs. Empty array if none.'),
});

userComponentsRoutes.post('/generate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiResponse<never>>({ success: false, error: 'prompt is required' }, 400);
  }

  const creds = await getProviderCredentials(c.env.AUTH_KV, user.id);
  const model = createModel('claude', creds, 'claude-haiku-4-5-20251001');

  const systemPrompt = [
    'You are a component registry assistant for a React + Tailwind v3 codebase.',
    'Given a description or code, generate a structured component registry entry.',
    'For single-file components or snippets, use type "snippet" and put all code in the `code` field.',
    'For multi-file components (stores, hooks, subcomponents), use type "app" and list each file in `files`.',
    'If the user pastes existing code, clean it up: remove platform-specific imports, ensure it is self-contained.',
    'Return real, working code. Do not use placeholder comments.',
    'tailwindClasses should list 3-8 notable classes used, not all classes.',
    'instructions should describe usage, props, and any gotchas — or be empty string.',
    'setupScript should be a single shell command string, or empty string.',
  ].join(' ');

  try {
    const result = await generateObject({
      model,
      schema: GeneratedComponentSchema,
      system: systemPrompt,
      prompt: parsed.data.prompt,
    });

    const draft = {
      ...result.object,
      // Normalize: app type should have empty code, snippet should have empty files
      code: result.object.type === 'app' ? '' : result.object.code,
      files: result.object.type === 'snippet' ? [] : result.object.files,
      instructions: result.object.instructions || undefined,
      setupScript: result.object.setupScript || undefined,
      agents: result.object.agents.length > 0 ? result.object.agents : undefined,
    };

    return c.json<ApiResponse<typeof draft>>({ success: true, data: draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    return c.json<ApiResponse<never>>({ success: false, error: msg }, 500);
  }
});
