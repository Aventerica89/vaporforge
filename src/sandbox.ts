import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { Session, ExecResult, FileInfo } from './types';

const WORKSPACE_PATH = '/workspace';
const HEALTH_CHECK_TIMEOUT = 5000;
const READY_POLL_DELAY = 2000;
const READY_MAX_ATTEMPTS = 5;
const CONFIG_STAMP_PATH = '/root/.claude/.vf-config-stamp';

function isSandboxNotReady(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('not ready')
    || msg.includes('shell has died')
    || msg.includes('disconnected prematurely');
}

// Keys to forward from Worker secrets to sandbox containers.
// SECURITY: Only forward secrets the container actually needs.
// VF infrastructure secrets (TURSO_*, AUTH_SECRET, ENCRYPTION_SECRET, SUPABASE_*)
// must NOT leak into user sandboxes.
const PROJECT_SECRET_KEYS = [
  'OP_SERVICE_ACCOUNT_TOKEN',  // 1Password CLI for `op read` in container
  'GITHUB_TOKEN',              // Git clone/push for private repos
] as const;

/** Collect defined project secrets from Worker env into a plain object. */
export function collectProjectSecrets(env: Env): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const key of PROJECT_SECRET_KEYS) {
    const val = (env as unknown as Record<string, unknown>)[key];
    if (typeof val === 'string' && val.length > 0) {
      secrets[key] = val;
    }
  }
  return secrets;
}

/** Names that must never be overridden by user secrets (defense-in-depth). */
const RESERVED_ENV_NAMES = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'NODE_PATH',
  'IS_SANDBOX',
  'PATH',
  'HOME',
  'USER',
  'SHELL',
]);

/** Collect per-user secrets from KV. Returns empty object on missing/invalid. */
export async function collectUserSecrets(
  kv: KVNamespace,
  userId: string
): Promise<Record<string, string>> {
  const raw = await kv.get(`user-secrets:${userId}`);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && !RESERVED_ENV_NAMES.has(k)) {
        result[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export interface SandboxConfig {
  gitRepo?: string;
  branch?: string;
  env?: Record<string, string>;
  /** User's global CLAUDE.md content — injected into ~/.claude/CLAUDE.md */
  claudeMd?: string;
  /** MCP servers config to inject into ~/.claude.json */
  mcpServers?: Record<string, Record<string, unknown>>;
  /** Plugin configs (agents, commands, rules, extra MCP) to inject */
  pluginConfigs?: {
    agents: Array<{ filename: string; content: string }>;
    commands: Array<{ filename: string; content: string }>;
    rules: Array<{ filename: string; content: string }>;
    mcpServers: Record<string, Record<string, unknown>>;
  };
  /** Standalone user config files (rules, commands, agents) to inject */
  userConfigs?: {
    rules: Array<{ filename: string; content: string }>;
    commands: Array<{ filename: string; content: string }>;
    agents: Array<{ filename: string; content: string }>;
  };
  /** VaporForge internal rules — prepended to CLAUDE.md in container */
  vfRules?: string;
  /** Start the MCP relay proxy in the container (for relay transport servers) */
  startRelayProxy?: boolean;
  /** Inject gemini-expert agent into the container */
  injectGeminiAgent?: boolean;
  /** Credential files to write into the container (e.g. OAuth credentials.json) */
  credentialFiles?: Array<{ path: string; content: string }>;
}

export class SandboxManager {
  constructor(
    private sandboxNamespace: DurableObjectNamespace<Sandbox>,
    private sessionsKv: KVNamespace,
    private filesBucket: R2Bucket
  ) {}

  // Get sandbox instance - minimal options like the official example
  private getSandboxInstance(sessionId: string): Sandbox {
    return getSandbox(this.sandboxNamespace, sessionId, {
      sleepAfter: '10m',
    });
  }

  // Verify the sandbox shell is alive with a simple exec
  async healthCheck(sessionId: string): Promise<boolean> {
    const sandbox = this.getSandboxInstance(sessionId);
    const start = Date.now();
    try {
      const result = await sandbox.exec('echo ok', {
        timeout: HEALTH_CHECK_TIMEOUT,
      });
      const ok = result.stdout?.trim() === 'ok';
      const sid = sessionId.slice(0, 8);
      const ms = Date.now() - start;
      console.log(`[healthCheck] ${sid}: ${ok ? 'OK' : 'FAIL'} (${ms}ms)`);
      return ok;
    } catch (err) {
      const sid = sessionId.slice(0, 8);
      const ms = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[healthCheck] ${sid}: ERROR (${ms}ms) ${msg}`);
      return false;
    }
  }

  // Poll until the sandbox shell is ready (or give up)
  private async waitForReady(sessionId: string): Promise<boolean> {
    const start = Date.now();
    for (let i = 0; i < READY_MAX_ATTEMPTS; i++) {
      if (await this.healthCheck(sessionId)) {
        const ms = Date.now() - start;
        console.log(`[waitForReady] ${sessionId.slice(0, 8)}: ready (${ms}ms, attempt ${i + 1})`);
        return true;
      }
      await new Promise((r) => setTimeout(r, READY_POLL_DELAY));
    }
    const ms = Date.now() - start;
    console.error(`[waitForReady] ${sessionId.slice(0, 8)}: FAILED (${ms}ms)`);
    return false;
  }

  // Create a new sandbox for a session
  async createSandbox(
    sessionId: string,
    userId: string,
    config?: SandboxConfig
  ): Promise<Session> {
    const sandbox = this.getSandboxInstance(sessionId);

    const session: Session = {
      id: sessionId,
      userId,
      sandboxId: sessionId,
      projectPath: WORKSPACE_PATH,
      gitRepo: config?.gitRepo,
      status: 'creating',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    // Store session
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    let step = 'init';
    try {
      // Set environment variables (always includes CLAUDE_CONFIG_DIR)
      step = 'setEnvVars';
      await sandbox.setEnvVars({
        ...(config?.env || {}),
        CLAUDE_CONFIG_DIR: '/root/.claude',
      });

      // Inject all config files (CLAUDE.md, MCP, plugins, user configs, Gemini agent)
      step = 'injectConfig';
      await this.injectAllConfig(sessionId, config);

      // Clone git repo using SDK's gitCheckout
      if (config?.gitRepo) {
        step = 'gitCheckout';
        await sandbox.gitCheckout(config.gitRepo, {
          targetDir: WORKSPACE_PATH,
          branch: config.branch,
        });
      } else {
        // Just create workspace directory
        step = 'mkdir';
        await sandbox.mkdir(WORKSPACE_PATH, { recursive: true });
      }

      // Verify the container shell is responsive before marking active
      step = 'healthCheck';
      console.log(`[createSandbox] ${sessionId.slice(0, 8)}: running health check...`);
      const ready = await this.waitForReady(sessionId);
      if (!ready) {
        throw new Error('Container started but shell never became responsive');
      }
      console.log(`[createSandbox] ${sessionId.slice(0, 8)}: health check PASSED`);

      // Start MCP relay proxy if relay servers are configured
      // Command is a fixed string (no user input) — safe for sandbox.exec
      if (config?.startRelayProxy) {
        step = 'startRelayProxy';
        const proxyCmd = 'nohup node /opt/claude-agent/mcp-relay-proxy.js > /tmp/mcp-relay.log 2>&1 &';
        console.log(`[createSandbox] ${sessionId.slice(0, 8)}: starting MCP relay proxy`);
        await sandbox.exec(proxyCmd, { timeout: 5000 });
      }

      // Update session status
      step = 'updateStatus';
      const activeSession: Session = {
        ...session,
        status: 'active',
      };
      await this.sessionsKv.put(
        `session:${sessionId}`,
        JSON.stringify(activeSession)
      );

      return activeSession;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      const errorMsg = `[${step}] ${rawMsg}`;
      const failedSession: Session = {
        ...session,
        status: 'terminated',
        metadata: {
          ...(session.metadata ?? {}),
          terminationError: errorMsg,
          terminatedAt: new Date().toISOString(),
        },
      };
      await this.sessionsKv.put(
        `session:${sessionId}`,
        JSON.stringify(failedSession)
      );
      throw new Error(errorMsg);
    }
  }

  // Get or wake existing sandbox — verifies shell is responsive when stale.
  // When config is provided, ensures config files are injected after wake
  // (they may be lost when a container recycles).
  async getOrWakeSandbox(
    sessionId: string,
    config?: SandboxConfig
  ): Promise<Session | null> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session) return null;

    // If the session is terminated or pending deletion, don't try to wake it
    if (session.status === 'terminated' || session.status === 'pending-delete') return null;

    // Check if sandbox might be auto-slept by Cloudflare (sleepAfter: 10m).
    // KV status can be stale — CF doesn't notify on auto-sleep.
    const msSinceActive = Date.now() - new Date(session.lastActiveAt).getTime();
    const mayBeSleeping = session.status === 'sleeping' || msSinceActive > 2 * 60 * 1000;

    if (mayBeSleeping) {
      const healthy = await this.healthCheck(sessionId);
      if (!healthy) {
        const ready = await this.waitForReady(sessionId);
        if (!ready) {
          // Shell is unresponsive — mark sleeping (NOT terminated, so it can retry later)
          const sleeping: Session = {
            ...session,
            status: 'sleeping',
            metadata: {
              ...(session.metadata ?? {}),
              lastWakeError: 'Shell unresponsive after wake attempt',
              lastWakeAttempt: new Date().toISOString(),
            },
          };
          await this.sessionsKv.put(
            `session:${sessionId}`,
            JSON.stringify(sleeping)
          );
          return null;
        }
      }

      // After wake, ensure config files are present (container may have recycled)
      if (config) {
        const wasRestored = await this.ensureConfigInjected(sessionId, config);
        if (wasRestored) {
          const now = new Date().toISOString();
          const updatedSession: Session = {
            ...session,
            lastActiveAt: now,
            status: 'active',
            metadata: {
              ...(session.metadata ?? {}),
              lastConfigCheck: now,
              configRestoredAt: now,
            },
          };
          await this.sessionsKv.put(
            `session:${sessionId}`,
            JSON.stringify(updatedSession)
          );
          return updatedSession;
        }
      }
    }

    const updatedSession: Session = {
      ...session,
      lastActiveAt: new Date().toISOString(),
      status: 'active',
      metadata: {
        ...(session.metadata ?? {}),
        lastConfigCheck: new Date().toISOString(),
      },
    };

    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(updatedSession)
    );

    return updatedSession;
  }

  // Execute command in sandbox (retries once on "not ready" errors)
  async execInSandbox(
    sessionId: string,
    command: string | string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<ExecResult> {
    const start = Date.now();
    const cmdStr = Array.isArray(command) ? command.join(' ') : command;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sandbox = this.getSandboxInstance(sessionId);
        const result = await sandbox.exec(cmdStr, {
          cwd: options?.cwd,
          env: options?.env,
          timeout: options?.timeout || 30000,
        });

        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode ?? (result.success ? 0 : 1),
          duration: Date.now() - start,
        };
      } catch (error) {
        if (attempt === 0 && isSandboxNotReady(error)) {
          const recovered = await this.waitForReady(sessionId);
          if (recovered) continue;
        }
        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unknown error',
          exitCode: 1,
          duration: Date.now() - start,
        };
      }
    }

    // Unreachable, but satisfies TypeScript
    return { stdout: '', stderr: 'Retry exhausted', exitCode: 1, duration: Date.now() - start };
  }

  // Execute command in sandbox with streaming output (retries once on "not ready" errors)
  async execStreamInSandbox(
    sessionId: string,
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<ReadableStream<Uint8Array>> {
    const sid = sessionId.slice(0, 8);

    // Pre-flight health check — catch dead shells before attempting stream
    const preHealthy = await this.healthCheck(sessionId);
    console.log(`[execStream] ${sid}: pre-flight health=${preHealthy}`);

    if (!preHealthy) {
      console.log(`[execStream] ${sid}: pre-flight FAILED, waiting for ready...`);
      const recovered = await this.waitForReady(sessionId);
      if (!recovered) {
        throw new Error(`Sandbox ${sid} shell is dead — pre-flight health check failed`);
      }
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sandbox = this.getSandboxInstance(sessionId);
        console.log(`[execStream] ${sid}: attempt ${attempt + 1} starting`);
        const stream = await sandbox.execStream(command, {
          cwd: options?.cwd,
          env: options?.env,
          timeout: options?.timeout || 300000,
        });
        console.log(`[execStream] ${sid}: attempt ${attempt + 1} stream started OK`);
        return stream;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[execStream] ${sid}: attempt ${attempt + 1} FAILED: ${msg}`);
        if (attempt === 0 && isSandboxNotReady(error)) {
          const recovered = await this.waitForReady(sessionId);
          if (recovered) continue;
        }
        throw error;
      }
    }

    throw new Error('Retry exhausted');
  }

  // Start the WebSocket agent server in the container (if not already running)
  async startWsServer(sessionId: string): Promise<void> {
    const sid = sessionId.slice(0, 8);
    const sandbox = this.getSandboxInstance(sessionId);

    // Check if already running
    const check = await sandbox.exec('pgrep -f ws-agent-server.js || true', { timeout: 5000 });
    if (check.stdout?.trim()) {
      console.log(`[startWsServer] ${sid}: already running (pid ${check.stdout.trim()})`);
      return;
    }

    // Start the WS server in background
    await sandbox.exec(
      'nohup node /opt/claude-agent/ws-agent-server.js > /tmp/ws-agent-server.log 2>&1 &',
      { timeout: 5000 }
    );

    // Wait for it to bind
    await new Promise((r) => setTimeout(r, 500));

    // Verify it started
    const verify = await sandbox.exec('pgrep -f ws-agent-server.js || true', { timeout: 5000 });
    if (verify.stdout?.trim()) {
      console.log(`[startWsServer] ${sid}: started (pid ${verify.stdout.trim()})`);
    } else {
      console.error(`[startWsServer] ${sid}: failed to start — check /tmp/ws-agent-server.log`);
      throw new Error('WebSocket agent server failed to start');
    }
  }

  // Proxy a WebSocket connection to the container's WS server on port 8765
  async wsConnectToSandbox(sessionId: string, request: Request): Promise<Response> {
    const sandbox = this.getSandboxInstance(sessionId);
    return sandbox.wsConnect(request, 8765);
  }

  // Write query context to a temp file in the container (for the WS server to read)
  async writeContextFile(
    sessionId: string,
    context: { prompt: string; sessionId: string; cwd: string; env: Record<string, string> }
  ): Promise<void> {
    const sandbox = this.getSandboxInstance(sessionId);
    await sandbox.writeFile('/tmp/vf-pending-query.json', JSON.stringify(context));
  }

  // Read file from sandbox
  async readFile(sessionId: string, path: string): Promise<string | null> {
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      const file = await sandbox.readFile(path);
      return file.content;
    } catch {
      return null;
    }
  }

  // Write file to sandbox
  async writeFile(
    sessionId: string,
    path: string,
    content: string
  ): Promise<boolean> {
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      await sandbox.writeFile(path, content);
      return true;
    } catch {
      return false;
    }
  }

  // List files in sandbox directory
  async listFiles(
    sessionId: string,
    path: string = WORKSPACE_PATH
  ): Promise<FileInfo[]> {
    const sandbox = this.getSandboxInstance(sessionId);
    const sid = sessionId.slice(0, 8);

    try {
      // Use exec ls as fallback since sandbox.listFiles may not work reliably
      const result = await sandbox.exec(
        `ls -1aF "${path}" 2>/dev/null || echo "__LS_FAILED__"`,
        { timeout: 10000 }
      );

      const output = result.stdout?.trim() || '';
      console.log(`[listFiles] ${sid}: path=${path} output=${output.slice(0, 200)}`);

      if (!output || output === '__LS_FAILED__') return [];

      return output.split('\n')
        .filter((line) => line && line !== '.' && line !== './' && line !== '..' && line !== '../')
        .map((entry) => {
          const isDir = entry.endsWith('/');
          const name = isDir ? entry.slice(0, -1) : entry;
          return {
            path: `${path}/${name}`,
            name,
            type: isDir ? 'directory' as const : 'file' as const,
          };
        });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[listFiles] ${sid}: ERROR ${msg}`);
      return [];
    }
  }

  // Check if file exists
  async fileExists(sessionId: string, path: string): Promise<boolean> {
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      const result = await sandbox.exists(path);
      return result.exists;
    } catch {
      return false;
    }
  }

  // Create directory
  async mkdir(
    sessionId: string,
    path: string,
    recursive = true
  ): Promise<boolean> {
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      await sandbox.mkdir(path, { recursive });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Inject all config into a sandbox container:
   * CLAUDE.md, MCP servers, plugin files, user configs, Gemini agent.
   * Writes a sentinel stamp file after successful injection.
   * Called by both createSandbox (initial) and ensureConfigInjected (wake).
   */
  private async injectAllConfig(
    sessionId: string,
    config?: SandboxConfig
  ): Promise<void> {
    if (!config) return;

    const sandbox = this.getSandboxInstance(sessionId);
    const sid = sessionId.slice(0, 8);

    // CLAUDE.md (VF rules + user CLAUDE.md)
    const hasVfRules = config.vfRules && config.vfRules.trim().length > 0;
    const hasClaudeMd = config.claudeMd && config.claudeMd.trim().length > 0;
    if (hasVfRules || hasClaudeMd) {
      await sandbox.mkdir('/root/.claude', { recursive: true });
      const parts: string[] = [];
      if (hasVfRules) parts.push(config.vfRules!.trim());
      if (hasClaudeMd) parts.push(config.claudeMd!.trim());
      await sandbox.writeFile(
        '/root/.claude/CLAUDE.md',
        parts.join('\n\n---\n\n')
      );
    }

    // MCP servers + plugin MCP -> ~/.claude.json
    const hasMcp = config.mcpServers && Object.keys(config.mcpServers).length > 0;
    const hasPluginMcp = config.pluginConfigs?.mcpServers
      && Object.keys(config.pluginConfigs.mcpServers).length > 0;
    if (hasMcp || hasPluginMcp) {
      const mergedMcp: Record<string, Record<string, unknown>> = {
        ...(config.mcpServers || {}),
        ...(config.pluginConfigs?.mcpServers || {}),
      };
      const claudeJson = JSON.stringify({ mcpServers: mergedMcp }, null, 2);
      await sandbox.writeFile('/root/.claude.json', claudeJson);
    }

    // Plugin files (agents, commands, rules)
    if (config.pluginConfigs) {
      if (config.pluginConfigs.agents.length) {
        await sandbox.mkdir('/root/.claude/agents', { recursive: true });
        for (const agent of config.pluginConfigs.agents) {
          await sandbox.writeFile(
            `/root/.claude/agents/${agent.filename}`,
            agent.content
          );
        }
      }
      if (config.pluginConfigs.commands.length) {
        await sandbox.mkdir('/root/.claude/commands', { recursive: true });
        for (const cmd of config.pluginConfigs.commands) {
          await sandbox.writeFile(
            `/root/.claude/commands/${cmd.filename}`,
            cmd.content
          );
        }
      }
      if (config.pluginConfigs.rules.length) {
        await sandbox.mkdir('/root/.claude/rules', { recursive: true });
        for (const rule of config.pluginConfigs.rules) {
          await sandbox.writeFile(
            `/root/.claude/rules/${rule.filename}`,
            rule.content
          );
        }
      }
    }

    // User config files (after plugins, so user overrides plugin)
    if (config.userConfigs) {
      await this.injectUserConfigs(sessionId, config.userConfigs);
    }

    // Gemini agent
    if (config.injectGeminiAgent) {
      await sandbox.mkdir('/root/.claude/agents', { recursive: true });
      const agentContent = [
        '---',
        'name: gemini-expert',
        'description: Delegate reasoning to Google Gemini via MCP tools',
        '---',
        'You are a Gemini relay agent. For EVERY user request:',
        '1. Use `gemini_quick_query` for simple questions and explanations',
        '2. Use `gemini_analyze_code` for code review and analysis tasks',
        '3. Use `gemini_codebase_analysis` for multi-file review',
        "Present Gemini's response directly. Do NOT add your own analysis.",
      ].join('\n');
      await sandbox.writeFile(
        '/root/.claude/agents/gemini-expert.md',
        agentContent
      );
    }

    // Credential files (e.g. OAuth credentials.json for stdio MCP servers)
    if (config.credentialFiles && config.credentialFiles.length > 0) {
      for (const cred of config.credentialFiles) {
        // Ensure parent directory exists
        const parentDir = cred.path.substring(0, cred.path.lastIndexOf('/'));
        if (parentDir) {
          await sandbox.mkdir(parentDir, { recursive: true });
        }
        await sandbox.writeFile(cred.path, cred.content);
        console.log(`[injectAllConfig] ${sid}: wrote credential file ${cred.path}`);
      }
    }

    // Write sentinel stamp so we can skip re-injection on future wake
    const stamp = `${sessionId}:${Date.now()}`;
    await sandbox.mkdir('/root/.claude', { recursive: true });
    await sandbox.writeFile(CONFIG_STAMP_PATH, stamp);
    console.log(`[injectAllConfig] ${sid}: config injected, stamp written`);
  }

  /**
   * Check the sentinel stamp file and re-inject config if missing or stale.
   * Fast path: single `cat` check — returns immediately if stamp is valid.
   */
  private async ensureConfigInjected(
    sessionId: string,
    config: SandboxConfig
  ): Promise<boolean> {
    const sid = sessionId.slice(0, 8);

    try {
      const stamp = await this.readFile(sessionId, CONFIG_STAMP_PATH);
      if (stamp && stamp.startsWith(sessionId)) {
        console.log(`[ensureConfigInjected] ${sid}: stamp valid, skipping`);
        return false;
      }
    } catch {
      // File doesn't exist — config was lost
    }

    console.log(`[ensureConfigInjected] ${sid}: stamp missing/stale, re-injecting`);
    await this.injectAllConfig(sessionId, config);
    return true;
  }

  /**
   * Sync config files FROM the container back TO KV.
   * Reads CLAUDE.md from the container, compares with KV value,
   * and writes back only if changed. Non-blocking — call in waitUntil.
   */
  async syncConfigFromContainer(
    sessionId: string,
    userId: string,
    kv: KVNamespace
  ): Promise<{ synced: boolean; claudeMdChanged: boolean }> {
    const sid = sessionId.slice(0, 8);
    let claudeMdChanged = false;

    try {
      // Read CLAUDE.md from container
      const containerClaudeMd = await this.readFile(
        sessionId,
        '/root/.claude/CLAUDE.md'
      );

      if (containerClaudeMd) {
        // Strip VF rules prefix — only persist the user portion
        const separator = '\n\n---\n\n';
        const sepIndex = containerClaudeMd.indexOf(separator);
        const userPortion = sepIndex >= 0
          ? containerClaudeMd.slice(sepIndex + separator.length)
          : containerClaudeMd;

        const kvClaudeMd = await kv.get(`user-config:${userId}:claude-md`);
        if (userPortion.trim() !== (kvClaudeMd || '').trim()) {
          await kv.put(`user-config:${userId}:claude-md`, userPortion);
          claudeMdChanged = true;
          console.log(`[syncConfig] ${sid}: CLAUDE.md synced back to KV`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[syncConfig] ${sid}: sync failed: ${msg}`);
    }

    return { synced: claudeMdChanged, claudeMdChanged };
  }

  /**
   * Inject plugin files (agents, commands, rules) into a sandbox's ~/.claude/ dir.
   * Clears old plugin files first so uninstalled plugins are removed.
   * Does NOT touch user config files — call injectUserConfigs() after this.
   */
  async injectPluginFiles(
    sessionId: string,
    pluginConfigs: {
      agents: Array<{ filename: string; content: string }>;
      commands: Array<{ filename: string; content: string }>;
      rules: Array<{ filename: string; content: string }>;
      mcpServers: Record<string, Record<string, unknown>>;
    }
  ): Promise<void> {
    const sandbox = this.getSandboxInstance(sessionId);

    // Clear old plugin files so uninstalled plugin files are removed.
    // Safe: hardcoded path, no user input.
    await sandbox.exec(
      'rm -rf /root/.claude/agents /root/.claude/commands /root/.claude/rules',
      { timeout: 5000 }
    );

    if (pluginConfigs.agents.length) {
      await sandbox.mkdir('/root/.claude/agents', { recursive: true });
      for (const agent of pluginConfigs.agents) {
        await sandbox.writeFile(
          `/root/.claude/agents/${agent.filename}`,
          agent.content
        );
      }
    }

    if (pluginConfigs.commands.length) {
      await sandbox.mkdir('/root/.claude/commands', { recursive: true });
      for (const cmd of pluginConfigs.commands) {
        await sandbox.writeFile(
          `/root/.claude/commands/${cmd.filename}`,
          cmd.content
        );
      }
    }

    if (pluginConfigs.rules.length) {
      await sandbox.mkdir('/root/.claude/rules', { recursive: true });
      for (const rule of pluginConfigs.rules) {
        await sandbox.writeFile(
          `/root/.claude/rules/${rule.filename}`,
          rule.content
        );
      }
    }

    // Update ~/.claude.json MCP config if plugin MCP servers changed
    if (Object.keys(pluginConfigs.mcpServers).length > 0) {
      let existingMcp: Record<string, Record<string, unknown>> = {};
      try {
        const existing = await sandbox.readFile('/root/.claude.json');
        if (existing.content) {
          const parsed = JSON.parse(existing.content);
          existingMcp = parsed.mcpServers || {};
        }
      } catch {
        // No existing config
      }
      const mergedMcp = { ...existingMcp, ...pluginConfigs.mcpServers };
      await sandbox.writeFile(
        '/root/.claude.json',
        JSON.stringify({ mcpServers: mergedMcp }, null, 2)
      );
    }
  }

  /**
   * Inject user config files (rules, commands, agents from Command Center)
   * into a sandbox. Called AFTER injectPluginFiles() so user configs take priority.
   */
  async injectUserConfigs(
    sessionId: string,
    userConfigs: {
      rules: Array<{ filename: string; content: string }>;
      commands: Array<{ filename: string; content: string }>;
      agents: Array<{ filename: string; content: string }>;
    }
  ): Promise<void> {
    const sandbox = this.getSandboxInstance(sessionId);

    if (userConfigs.rules.length) {
      await sandbox.mkdir('/root/.claude/rules', { recursive: true });
      for (const rule of userConfigs.rules) {
        await sandbox.writeFile(
          `/root/.claude/rules/${rule.filename}`,
          rule.content
        );
      }
    }

    if (userConfigs.commands.length) {
      await sandbox.mkdir('/root/.claude/commands', { recursive: true });
      for (const cmd of userConfigs.commands) {
        await sandbox.writeFile(
          `/root/.claude/commands/${cmd.filename}`,
          cmd.content
        );
      }
    }

    if (userConfigs.agents.length) {
      await sandbox.mkdir('/root/.claude/agents', { recursive: true });
      for (const agent of userConfigs.agents) {
        await sandbox.writeFile(
          `/root/.claude/agents/${agent.filename}`,
          agent.content
        );
      }
    }
  }

  // Terminate sandbox
  async terminateSandbox(sessionId: string): Promise<void> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session) return;

    const terminated: Session = {
      ...session,
      status: 'terminated',
    };
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(terminated)
    );
  }

  // Sleep sandbox
  async sleepSandbox(sessionId: string): Promise<void> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session || session.status !== 'active') return;

    const sleeping: Session = {
      ...session,
      status: 'sleeping',
    };
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(sleeping)
    );
  }
}
