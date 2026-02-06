import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { Session, ExecResult, FileInfo } from './types';

const WORKSPACE_PATH = '/workspace';

export interface SandboxConfig {
  gitRepo?: string;
  branch?: string;
  env?: Record<string, string>;
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

    try {
      // Set environment variables if provided
      if (config?.env) {
        await sandbox.setEnvVars(config.env);
      }

      // Clone git repo using SDK's gitCheckout
      if (config?.gitRepo) {
        await sandbox.gitCheckout(config.gitRepo, {
          targetDir: WORKSPACE_PATH,
          branch: config.branch,
        });
      } else {
        // Just create workspace directory
        await sandbox.mkdir(WORKSPACE_PATH, { recursive: true });
      }

      // Update session status
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      const failedSession: Session = {
        ...session,
        status: 'terminated',
        metadata: {
          ...session.metadata,
          terminationError: errorMsg,
          terminatedAt: new Date().toISOString(),
        },
      };
      await this.sessionsKv.put(
        `session:${sessionId}`,
        JSON.stringify(failedSession)
      );
      throw error;
    }
  }

  // Get or wake existing sandbox
  async getOrWakeSandbox(sessionId: string): Promise<Session | null> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session) return null;

    const updatedSession: Session = {
      ...session,
      lastActiveAt: new Date().toISOString(),
      status: session.status === 'sleeping' ? 'active' : session.status,
    };

    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(updatedSession)
    );

    return updatedSession;
  }

  // Execute command in sandbox
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
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      const cmdStr = Array.isArray(command) ? command.join(' ') : command;

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
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        duration: Date.now() - start,
      };
    }
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
