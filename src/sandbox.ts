import type { Session, ExecResult, FileInfo } from './types';

const SANDBOX_TIMEOUT = 10 * 60 * 1000; // 10 minutes idle timeout
const WORKSPACE_PATH = '/workspace';

export interface SandboxConfig {
  gitRepo?: string;
  branch?: string;
  env?: Record<string, string>;
}

export class SandboxManager {
  private activeSandboxes: Map<string, {
    lastActive: number;
    container: DurableObjectStub;
  }> = new Map();

  constructor(
    private container: Container,
    private sessionsKv: KVNamespace,
    private filesBucket: R2Bucket
  ) {}

  // Create a new sandbox for a session
  async createSandbox(
    sessionId: string,
    userId: string,
    config?: SandboxConfig
  ): Promise<Session> {
    const sandboxId = crypto.randomUUID();

    const session: Session = {
      id: sessionId,
      userId,
      sandboxId,
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

    // Initialize sandbox
    try {
      // Clone git repo if provided
      if (config?.gitRepo) {
        await this.execInSandbox(sandboxId, [
          'git',
          'clone',
          config.gitRepo,
          WORKSPACE_PATH,
        ]);

        if (config.branch) {
          await this.execInSandbox(sandboxId, [
            'git',
            '-C',
            WORKSPACE_PATH,
            'checkout',
            config.branch,
          ]);
        }
      } else {
        // Create empty workspace
        await this.execInSandbox(sandboxId, ['mkdir', '-p', WORKSPACE_PATH]);
      }

      // Set up environment variables
      if (config?.env) {
        const envContent = Object.entries(config.env)
          .map(([k, v]) => `export ${k}="${v}"`)
          .join('\n');

        await this.writeFile(sandboxId, '/root/.bashrc', envContent);
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

  // Execute command in sandbox
  async execInSandbox(
    sandboxId: string,
    command: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<ExecResult> {
    const start = Date.now();

    try {
      const instance = this.container.get(sandboxId);

      const response = await instance.fetch(
        new Request('http://sandbox/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command,
            cwd: options?.cwd || WORKSPACE_PATH,
            env: options?.env,
            timeout: options?.timeout || 30000,
          }),
        })
      );

      const result = await response.json() as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
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
  async readFile(sandboxId: string, path: string): Promise<string | null> {
    const result = await this.execInSandbox(sandboxId, ['cat', path]);
    if (result.exitCode !== 0) return null;
    return result.stdout;
  }

  // Write file to sandbox
  async writeFile(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<boolean> {
    // Use base64 to handle special characters
    const encoded = btoa(content);
    const result = await this.execInSandbox(sandboxId, [
      'sh',
      '-c',
      `echo "${encoded}" | base64 -d > "${path}"`,
    ]);
    return result.exitCode === 0;
  }

  // List files in sandbox directory
  async listFiles(
    sandboxId: string,
    path: string = WORKSPACE_PATH
  ): Promise<FileInfo[]> {
    const result = await this.execInSandbox(sandboxId, [
      'ls',
      '-la',
      '--time-style=+%Y-%m-%dT%H:%M:%S',
      path,
    ]);

    if (result.exitCode !== 0) return [];

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
  }

  // Backup workspace to R2
  async backupToR2(session: Session): Promise<void> {
    if (!session.sandboxId) return;

    // Create tar archive
    const result = await this.execInSandbox(session.sandboxId, [
      'tar',
      '-czf',
      '-',
      '-C',
      WORKSPACE_PATH,
      '.',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Backup failed: ${result.stderr}`);
    }

    // Store in R2
    const encoder = new TextEncoder();
    await this.filesBucket.put(
      `backups/${session.id}/workspace.tar.gz`,
      encoder.encode(result.stdout)
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

    // Extract to workspace
    await this.execInSandbox(session.sandboxId, [
      'sh',
      '-c',
      `echo "${btoa(content)}" | base64 -d | tar -xzf - -C ${WORKSPACE_PATH}`,
    ]);
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

    this.activeSandboxes.delete(sessionId);
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

    this.activeSandboxes.delete(sessionId);
  }

  // Cleanup idle sandboxes
  async cleanupIdleSandboxes(): Promise<void> {
    const now = Date.now();

    for (const [sessionId, sandbox] of this.activeSandboxes) {
      if (now - sandbox.lastActive > SANDBOX_TIMEOUT) {
        await this.sleepSandbox(sessionId);
      }
    }
  }
}
