import { Hono } from 'hono';
import type { User } from '../types';
import type { ApiResponse } from '../types';

type Variables = {
  user: User;
};

export const userRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Max size for user CLAUDE.md content (50KB — generous but bounded) */
const MAX_CLAUDE_MD_SIZE = 50_000;

/** Default user CLAUDE.md — shown when user has not set custom content */
const DEFAULT_CLAUDE_MD = `## My Preferences

Add your personal coding preferences and rules here. This content is injected
into every Claude session alongside the VaporForge container rules above.

## Credential Files

MCP credential files are automatically injected at session start.
Their paths are listed under "Injected Credential Files" in this file —
check there before asking the user to re-provide credentials.
`;

/** Max size for VF internal rules (20KB) */
const MAX_VF_RULES_SIZE = 20_000;

/** Default VF internal rules — container-aware instructions for the SDK */
const DEFAULT_VF_RULES = `# VaporForge Container Rules

## Environment

You are running inside a **VaporForge cloud sandbox** — a Cloudflare container, NOT a local machine.

- Your working directory is \`/workspace\`. All project files live here.
- You are running as root with full permissions (bypassPermissions mode).
- \`~\` is \`/root\`. There is no personal user home — VaporForge manages all config.
- This is a headless Linux container. No desktop, no GUI, no browser.
- The container has internet access for git, npm, pip, curl, etc.

## What NOT to Do

- Do NOT look for local Claude Code config files (\`~/.claude/settings.json\`, \`~/.claude/projects/\`). These are managed by VaporForge and injected automatically.
- Do NOT try to run \`claude\` CLI commands like \`claude mcp\`, \`claude config\`, or \`claude setup-token\`. You ARE the Claude instance.
- Do NOT reference the user's local machine, OS, or filesystem. Everything is in \`/workspace\`.
- Do NOT suggest opening files in VS Code, Cursor, or other desktop editors. The user is working through VaporForge's web UI.
- Do NOT try to install Claude Code or any Claude CLI tools. The SDK is already running.
- Do NOT ask the user for credentials or API keys that are already injected. Check \`/root/.claude/CLAUDE.md\` for injected credential file paths before asking.

## What TO Do

- Create, edit, and manage all files in \`/workspace\`.
- Use git normally (clone, commit, push, pull) — credentials are configured.
- Install packages with npm, pip, cargo, etc. as needed.
- Run tests, build commands, and dev servers as requested.
- When the user asks about their project, look in \`/workspace\`.

## MCP Servers

MCP servers configured in Settings are injected into \`~/.claude.json\` automatically.
They work through a relay proxy. Do NOT try to configure MCP servers manually.

**Credential files** for MCP servers (e.g. OAuth tokens, service account JSON) are automatically written to the container filesystem at session start. Their exact paths are listed in \`/root/.claude/CLAUDE.md\` under "Injected Credential Files". Use those paths directly — do NOT ask the user to provide them again.

## Secrets

Environment secrets from Settings > Secrets are available as env vars.
Access them via \`$SECRET_NAME\` in the terminal or \`process.env.SECRET_NAME\` in code.

## Communication

Your responses stream to the user's browser in real-time. Keep responses focused and avoid unnecessarily long output — the user sees every character as it arrives.

**After any task involving tool use** (writing files, running commands, making edits, etc.), always follow up with a brief text summary of what was done. The user cannot see individual tool calls — without a text response they have no way to know if the work is complete or if you need input to continue.
`;

/** Fetch per-session budget ceiling for a user. Returns undefined (no limit) when not set. */
export async function getMaxBudgetUsd(
  kv: KVNamespace,
  userId: string
): Promise<number | undefined> {
  const raw = await kv.get(`user-config:${userId}:max-budget-usd`);
  if (raw === null) return undefined;
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : undefined;
}

/** Fetch auto-context preference for a user. Default: true (enabled). */
export async function getAutoContextPref(
  kv: KVNamespace,
  userId: string
): Promise<boolean> {
  const raw = await kv.get(`user-config:${userId}:auto-context`);
  if (raw === null) return true;
  return raw !== 'false';
}

/** Fetch VF internal rules for a user (returns default if none saved). */
export async function getVfRules(
  kv: KVNamespace,
  userId: string
): Promise<string> {
  const stored = await kv.get(`user-config:${userId}:vf-rules`);
  return stored ?? DEFAULT_VF_RULES;
}

// Get user's CLAUDE.md
userRoutes.get('/claude-md', async (c) => {
  const user = c.get('user');

  const content = await c.env.SESSIONS_KV.get(
    `user-config:${user.id}:claude-md`
  );

  // Guard against legacy corruption: if KV holds the injected credential section
  // (from the sync bug fixed in this version), treat as empty so settings UI is clean.
  const isCorrupt = content?.trim().startsWith('## Injected Credential Files');
  const cleaned = isCorrupt ? null : content;

  return c.json<ApiResponse<{ content: string }>>({
    success: true,
    data: { content: cleaned ?? DEFAULT_CLAUDE_MD },
  });
});

// Get VF internal rules
userRoutes.get('/vf-rules', async (c) => {
  const user = c.get('user');

  const content = await c.env.SESSIONS_KV.get(
    `user-config:${user.id}:vf-rules`
  );

  return c.json<ApiResponse<{ content: string; isDefault: boolean }>>({
    success: true,
    data: {
      content: content ?? DEFAULT_VF_RULES,
      isDefault: content === null,
    },
  });
});

// Save VF internal rules
userRoutes.put('/vf-rules', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ content: string }>();

  if (typeof body.content !== 'string') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Content must be a string',
    }, 400);
  }

  if (body.content.length > MAX_VF_RULES_SIZE) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Content exceeds maximum size (${MAX_VF_RULES_SIZE} chars)`,
    }, 400);
  }

  await c.env.SESSIONS_KV.put(
    `user-config:${user.id}:vf-rules`,
    body.content
  );

  return c.json<ApiResponse<{ saved: boolean }>>({
    success: true,
    data: { saved: true },
  });
});

// Reset VF internal rules to default
userRoutes.delete('/vf-rules', async (c) => {
  const user = c.get('user');

  await c.env.SESSIONS_KV.delete(
    `user-config:${user.id}:vf-rules`
  );

  return c.json<ApiResponse<{ content: string }>>({
    success: true,
    data: { content: DEFAULT_VF_RULES },
  });
});

// Get auto-context preference
userRoutes.get('/auto-context', async (c) => {
  const user = c.get('user');
  const enabled = await getAutoContextPref(c.env.SESSIONS_KV, user.id);
  return c.json<ApiResponse<{ enabled: boolean }>>({
    success: true,
    data: { enabled },
  });
});

// Set auto-context preference
userRoutes.put('/auto-context', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ enabled: boolean }>();

  if (typeof body.enabled !== 'boolean') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'enabled must be a boolean',
    }, 400);
  }

  await c.env.SESSIONS_KV.put(
    `user-config:${user.id}:auto-context`,
    String(body.enabled)
  );

  return c.json<ApiResponse<{ enabled: boolean }>>({
    success: true,
    data: { enabled: body.enabled },
  });
});

// Get per-session budget ceiling
userRoutes.get('/max-budget', async (c) => {
  const user = c.get('user');
  const value = await getMaxBudgetUsd(c.env.SESSIONS_KV, user.id);
  return c.json<ApiResponse<{ maxBudgetUsd: number | null }>>({
    success: true,
    data: { maxBudgetUsd: value ?? null },
  });
});

// Set per-session budget ceiling (null or 0 = no limit)
userRoutes.put('/max-budget', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ maxBudgetUsd: number | null }>();

  if (body.maxBudgetUsd !== null && (typeof body.maxBudgetUsd !== 'number' || body.maxBudgetUsd < 0)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'maxBudgetUsd must be a positive number or null',
    }, 400);
  }

  const kv = c.env.SESSIONS_KV;
  const key = `user-config:${user.id}:max-budget-usd`;

  if (!body.maxBudgetUsd || body.maxBudgetUsd <= 0) {
    await kv.delete(key);
    return c.json<ApiResponse<{ maxBudgetUsd: null }>>({
      success: true,
      data: { maxBudgetUsd: null },
    });
  }

  await kv.put(key, String(body.maxBudgetUsd));
  return c.json<ApiResponse<{ maxBudgetUsd: number }>>({
    success: true,
    data: { maxBudgetUsd: body.maxBudgetUsd },
  });
});

// Save user's CLAUDE.md
userRoutes.put('/claude-md', async (c) => {
  const user = c.get('user');

  const body = await c.req.json<{ content: string }>();

  if (typeof body.content !== 'string') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Content must be a string',
    }, 400);
  }

  if (body.content.length > MAX_CLAUDE_MD_SIZE) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: `Content exceeds maximum size (${MAX_CLAUDE_MD_SIZE} chars)`,
    }, 400);
  }

  await c.env.SESSIONS_KV.put(
    `user-config:${user.id}:claude-md`,
    body.content
  );

  return c.json<ApiResponse<{ saved: boolean }>>({
    success: true,
    data: { saved: true },
  });
});
