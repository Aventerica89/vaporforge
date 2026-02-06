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

  // Get sandbox instance using official SDK
  private getSandboxInstance(sessionId: string): Sandbox {
    return getSandbox(this.sandboxNamespace, sessionId, {
      sleepAfter: '10m', // Auto-sleep after 10 min idle
      normalizeId: true, // Normalize IDs for preview URLs
      containerTimeouts: {
        instanceGetTimeoutMS: 120000, // 2 min for container provisioning
        portReadyTimeoutMS: 120000,   // 2 min for app startup
      },
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
      { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
    );

    try {
      // Set environment variables if provided
      if (config?.env) {
        await sandbox.setEnvVars(config.env);
      }

      // Clone git repo if provided
      if (config?.gitRepo) {
        const cloneCmd = `git clone ${config.gitRepo} ${WORKSPACE_PATH}`;
        await sandbox.exec(cloneCmd);

        if (config.branch) {
          await sandbox.exec(`git -C ${WORKSPACE_PATH} checkout ${config.branch}`);
        }
      } else {
        // Create empty workspace
        await sandbox.mkdir(WORKSPACE_PATH, { recursive: true });
      }

      // Update session status
      session.status = 'active';
      await this.sessionsKv.put(
        `session:${sessionId}`,
        JSON.stringify(session)
      );

      return session;
    } catch (error) {
      session.status = 'terminated';
      await this.sessionsKv.put(
        `session:${sessionId}`,
        JSON.stringify(session)
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

    if (session.status === 'sleeping') {
      // Restore from R2 backup
      await this.restoreFromBackup(session);
      session.status = 'active';
    }

    session.lastActiveAt = new Date().toISOString();
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(session)
    );

    return session;
  }

  // Execute command in sandbox using official SDK
  async execInSandbox(
    sessionId: string,
    command: string | string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      stream?: boolean;
    }
  ): Promise<ExecResult> {
    const start = Date.now();
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      // Convert array command to string
      const cmdStr = Array.isArray(command) ? command.join(' ') : command;

      // Use SDK native options for cwd, env, and timeout
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

  // Read file from sandbox using SDK
  async readFile(sessionId: string, path: string): Promise<string | null> {
    const sandbox = this.getSandboxInstance(sessionId);

    try {
      const file = await sandbox.readFile(path);
      return file.content;
    } catch {
      return null;
    }
  }

  // Write file to sandbox using SDK
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
      // Use exec to get file listing with details
      const result = await sandbox.exec(
        `ls -la --time-style=+%Y-%m-%dT%H:%M:%S ${path}`
      );

      if (!result.success || !result.stdout) return [];

      const files: FileInfo[] = [];
      const lines = result.stdout.split('\n').slice(1); // Skip total line

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;

        const name = parts.slice(6).join(' ');
        if (name === '.' || name === '..') continue;

        const isDirectory = parts[0].startsWith('d');
        const size = parseInt(parts[4], 10);
        const modifiedAt = parts[5];

        files.push({
          path: `${path}/${name}`.replace(/\/+/g, '/'),
          name,
          type: isDirectory ? 'directory' : 'file',
          size: isDirectory ? undefined : size,
          modifiedAt,
        });
      }

      return files;
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

  // Backup workspace to R2
  async backupToR2(session: Session): Promise<void> {
    if (!session.sandboxId) return;

    const sandbox = this.getSandboxInstance(session.id);

    // Create tar archive
    const result = await sandbox.exec(
      `tar -czf - -C ${WORKSPACE_PATH} .`
    );

    if (!result.success) {
      throw new Error(`Backup failed: ${result.stderr}`);
    }

    // Store in R2
    const encoder = new TextEncoder();
    await this.filesBucket.put(
      `backups/${session.id}/workspace.tar.gz`,
      encoder.encode(result.stdout || '')
    );
  }

  // Restore workspace from R2
  async restoreFromBackup(session: Session): Promise<void> {
    if (!session.sandboxId) return;

    const backup = await this.filesBucket.get(
      `backups/${session.id}/workspace.tar.gz`
    );

    if (!backup) {
      throw new Error('Backup not found');
    }

    const content = await backup.text();
    const sandbox = this.getSandboxInstance(session.id);

    // Extract to workspace
    await sandbox.exec(
      `echo "${btoa(content)}" | base64 -d | tar -xzf - -C ${WORKSPACE_PATH}`
    );
  }

  // Terminate sandbox
  async terminateSandbox(sessionId: string): Promise<void> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session) return;

    // Backup before terminating
    try {
      await this.backupToR2(session);
    } catch {
      // Log but don't fail
    }

    session.status = 'terminated';
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(session)
    );
  }

  // Sleep sandbox (backup and release resources)
  async sleepSandbox(sessionId: string): Promise<void> {
    const session = await this.sessionsKv.get<Session>(
      `session:${sessionId}`,
      'json'
    );

    if (!session || session.status !== 'active') return;

    await this.backupToR2(session);

    session.status = 'sleeping';
    await this.sessionsKv.put(
      `session:${sessionId}`,
      JSON.stringify(session)
    );
  }
}
