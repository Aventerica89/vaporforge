import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { Session, ExecResult, FileInfo } from './types';

const WORKSPACE_PATH = '/workspace';
const HEALTH_CHECK_TIMEOUT = 5000;
const READY_POLL_DELAY = 2000;
const READY_MAX_ATTEMPTS = 5;

function isSandboxNotReady(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('not ready')
    || msg.includes('shell has died')
    || msg.includes('disconnected prematurely');
}

// Keys to forward from Worker secrets to sandbox containers.
// Add a new key here + `npx wrangler secret put KEY` to make it available.
const PROJECT_SECRET_KEYS = [
  'OP_SERVICE_ACCOUNT_TOKEN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'GITHUB_TOKEN',
  'ENCRYPTION_SECRET',
  'AUTH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Collect defined project secrets from Worker env into a plain object. */
export function collectProjectSecrets(env: Env): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const key of PROJECT_SECRET_KEYS) {
    const val = (env as Record<string, unknown>)[key];
    if (typeof val === 'string' && val.length > 0) {
      secrets[key] = val;
    }
  }
  return secrets;
}

export interface SandboxConfig {
  gitRepo?: string;
  branch?: string;
  env?: Record<string, string>;
  /** User's global CLAUDE.md content — injected into ~/.claude/CLAUDE.md */
  claudeMd?: string;
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
      // Set environment variables if provided
      if (config?.env) {
        step = 'setEnvVars';
        await sandbox.setEnvVars(config.env);
      }

      // Inject user's global CLAUDE.md into ~/.claude/
      if (config?.claudeMd) {
        step = 'writeCLAUDE.md';
        await sandbox.mkdir('/root/.claude', { recursive: true });
        await sandbox.writeFile('/root/.claude/CLAUDE.md', config.claudeMd);
      }

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
      console.log(`[createSandbox] ${sessionId.slice(0, 8)}: health check PASSED, marking active`);

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

  // Get or wake existing sandbox — verifies shell is responsive when stale
  async getOrWakeSandbox(sessionId: string): Promise<Session | null> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session) return null;

    // If the session is terminated, don't try to wake it
    if (session.status === 'terminated') return null;

    // Check if sandbox might be auto-slept by Cloudflare (sleepAfter: 10m).
    // KV status can be stale — CF doesn't notify on auto-sleep.
    const msSinceActive = Date.now() - new Date(session.lastActiveAt).getTime();
    const mayBeSleeping = session.status === 'sleeping' || msSinceActive > 2 * 60 * 1000;

    if (mayBeSleeping) {
      const healthy = await this.healthCheck(sessionId);
      if (!healthy) {
        const ready = await this.waitForReady(sessionId);
        if (!ready) {
          // Shell is unresponsive after all retries — mark terminated
          const terminated: Session = {
            ...session,
            status: 'terminated',
            metadata: {
              ...(session.metadata ?? {}),
              terminationError: 'Shell unresponsive after wake attempt',
              terminatedAt: new Date().toISOString(),
            },
          };
          await this.sessionsKv.put(
            `session:${sessionId}`,
            JSON.stringify(terminated)
          );
          return null;
        }
      }
    }

    const updatedSession: Session = {
      ...session,
      lastActiveAt: new Date().toISOString(),
      status: 'active',
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

    try {
      const result = await sandbox.listFiles(path);
      if (!result.success) return [];

      return result.files.map((f) => ({
        path: f.absolutePath,
        name: f.name,
        type: f.type === 'directory' ? 'directory' as const : 'file' as const,
        size: f.type === 'directory' ? undefined : f.size,
        modifiedAt: f.modifiedAt,
      }));
    } catch {
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
