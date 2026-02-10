import { create, type StateCreator } from 'zustand';
import { sessionsApi, filesApi, gitApi, chatApi, sdkApi } from '@/lib/api';
import { isShellCommand, isClaudeUtility } from '@/lib/terminal-utils';
import { generateSessionName } from '@/lib/session-names';
import { useDebugLog } from '@/hooks/useDebugLog';
import type { Session, FileInfo, Message, MessagePart, GitStatus, ImageAttachment } from '@/lib/types';

function debugLog(
  category: 'api' | 'stream' | 'sandbox' | 'error' | 'info',
  level: 'error' | 'warn' | 'info',
  summary: string,
  detail?: string
) {
  useDebugLog.getState().addEntry({ category, level, summary, detail });
}

interface SandboxState {
  // Session state
  currentSession: Session | null;
  sessions: Session[];
  isLoadingSessions: boolean;

  // File state
  files: FileInfo[];
  filesByPath: Record<string, FileInfo[]>;
  currentPath: string;
  currentFile: FileInfo | null;
  fileContent: string;
  isLoadingFiles: boolean;

  // Editor state
  openFiles: Array<{ path: string; content: string; isDirty: boolean }>;
  activeFileIndex: number;

  // Chat state
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingParts: MessagePart[];

  // Git state
  gitStatus: GitStatus | null;

  // Terminal state
  terminalOutput: string[];
  isExecuting: boolean;

  // Actions
  loadSessions: () => Promise<void>;
  createSession: (name?: string, gitRepo?: string, branch?: string) => Promise<Session | null>;
  selectSession: (sessionId: string) => Promise<void>;
  deselectSession: () => void;
  terminateSession: (sessionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  purgeSession: (sessionId: string) => Promise<void>;

  renameSession: (sessionId: string, name: string) => Promise<void>;

  loadFiles: (path?: string) => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: (index: number) => void;
  setActiveFile: (index: number) => void;
  updateFileContent: (content: string) => void;
  saveFile: () => Promise<void>;

  sendMessage: (message: string, images?: ImageAttachment[]) => Promise<void>;
  clearMessages: () => void;

  loadGitStatus: () => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  commitChanges: (message: string) => Promise<void>;

  execCommand: (command: string) => Promise<void>;
  clearTerminal: () => void;

  uploadFiles: (files: File[]) => Promise<void>;
  downloadFile: (path: string) => Promise<void>;
  downloadWorkspace: () => Promise<void>;
}

/** Maps file extensions to language identifiers for artifact detection */
const CODE_EXTS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
  py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
  html: 'html', css: 'css', json: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', bash: 'bash', sql: 'sql', md: 'markdown',
};

const createSandboxStore: StateCreator<SandboxState> = (set, get) => ({
  currentSession: null,
  sessions: [],
  isLoadingSessions: false,

  files: [],
  filesByPath: {},
  currentPath: '/workspace',
  currentFile: null,
  fileContent: '',
  isLoadingFiles: false,

  openFiles: [],
  activeFileIndex: -1,

  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingParts: [],

  gitStatus: null,

  terminalOutput: [],
  isExecuting: false,

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const result = await sessionsApi.list();
      if (result.success && result.data) {
        set({ sessions: result.data });
      }
    } finally {
      set({ isLoadingSessions: false });
    }
  },

  createSession: async (name?: string, gitRepo?: string, branch?: string) => {
    const sessionName = name || generateSessionName();
    const result = await sessionsApi.create({ name: sessionName, gitRepo, branch });
    if (result.success && result.data) {
      const session = result.data;
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
      }));
      localStorage.setItem('vf_active_session', session.id);
      return session;
    }
    const err = result.error || 'Failed to create session';
    debugLog('sandbox', 'error', `createSession failed: ${err}`);
    throw new Error(err);
  },

  selectSession: async (sessionId: string) => {
    // Track whether sandbox woke successfully (used for file/git loading)

    // Step 1: Try to resume sandbox (wake it up)
    try {
      const result = await sessionsApi.resume(sessionId);
      if (result.success && result.data) {
        set({
          currentSession: result.data,
          files: [],
          filesByPath: {},
          currentPath: '/workspace',
          openFiles: [],
          activeFileIndex: -1,
          messages: [],
          terminalOutput: [],
        });
        localStorage.setItem('vf_active_session', sessionId);
        // Load files and git status (needs sandbox)
        get().loadFiles();
        get().loadGitStatus();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      debugLog('sandbox', 'warn', `Resume failed: ${message}`);

      // Sandbox couldn't wake — fall back to session from loaded list
      const cachedSession = get().sessions.find((s) => s.id === sessionId);
      if (cachedSession) {
        set({
          currentSession: cachedSession,
          files: [],
          filesByPath: {},
          currentPath: '/workspace',
          openFiles: [],
          activeFileIndex: -1,
          messages: [],
          terminalOutput: [],
        });
        localStorage.setItem('vf_active_session', sessionId);
      } else {
        // Session truly doesn't exist anywhere
        localStorage.removeItem('vf_active_session');
        return;
      }
    }

    // Step 2: Always load chat history (independent of sandbox state)
    try {
      const historyResult = await chatApi.history(sessionId);
      if (historyResult.success && historyResult.data) {
        set({ messages: historyResult.data });
      }
    } catch (error) {
      debugLog('sandbox', 'warn', `History load failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  },

  deselectSession: () => {
    localStorage.removeItem('vf_active_session');
    set({
      currentSession: null,
      files: [],
      filesByPath: {},
      currentPath: '/workspace',
      openFiles: [],
      activeFileIndex: -1,
      messages: [],
      terminalOutput: [],
      gitStatus: null,
      streamingContent: '',
      isStreaming: false,
    });
  },

  renameSession: async (sessionId: string, name: string) => {
    try {
      const result = await sessionsApi.update(sessionId, { name });
      if (result.success && result.data) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? result.data! : s
          ),
          currentSession:
            state.currentSession?.id === sessionId
              ? result.data!
              : state.currentSession,
        }));
      }
    } catch {
      // Handle error
    }
  },

  terminateSession: async (sessionId: string) => {
    try {
      const result = await sessionsApi.terminate(sessionId);
      if (result.success && result.data) {
        // Keep in list as pending-delete (soft delete with countdown)
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...result.data! } : s
          ),
          currentSession:
            state.currentSession?.id === sessionId ? null : state.currentSession,
        }));
      }
    } catch {
      // Handle error
    }
  },

  restoreSession: async (sessionId: string) => {
    try {
      const result = await sessionsApi.restore(sessionId);
      if (result.success && result.data) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...result.data! } : s
          ),
        }));
      }
    } catch {
      // Handle error
    }
  },

  purgeSession: async (sessionId: string) => {
    try {
      const result = await sessionsApi.purge(sessionId);
      if (result.success) {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
        }));
      }
    } catch {
      // Handle error
    }
  },

  loadFiles: async (path?: string) => {
    const session = get().currentSession;
    if (!session) return;

    const targetPath = path || get().currentPath;

    set({ isLoadingFiles: true });
    try {
      const result = await filesApi.list(session.id, targetPath);
      if (result.success && result.data) {
        const newFilesByPath = {
          ...get().filesByPath,
          [targetPath]: result.data,
        };
        // If loading the current path, also update the flat files list
        if (targetPath === get().currentPath) {
          set({ files: result.data, filesByPath: newFilesByPath });
        } else {
          set({ filesByPath: newFilesByPath });
        }
      }
    } finally {
      set({ isLoadingFiles: false });
    }
  },

  navigateTo: async (path: string) => {
    const session = get().currentSession;
    if (!session) return;

    set({ currentPath: path, isLoadingFiles: true });
    try {
      const cached = get().filesByPath[path];
      if (cached) {
        set({ files: cached, isLoadingFiles: false });
      } else {
        const result = await filesApi.list(session.id, path);
        if (result.success && result.data) {
          set({
            files: result.data,
            filesByPath: { ...get().filesByPath, [path]: result.data },
          });
        }
      }
    } finally {
      set({ isLoadingFiles: false });
    }
  },

  openFile: async (path: string) => {
    const session = get().currentSession;
    if (!session) return;

    // Check if already open
    const existingIndex = get().openFiles.findIndex((f) => f.path === path);
    if (existingIndex !== -1) {
      set({ activeFileIndex: existingIndex });
      return;
    }

    try {
      const result = await filesApi.read(session.id, path);
      if (result.success && result.data) {
        set((state) => ({
          openFiles: [
            ...state.openFiles,
            { path, content: result.data!.content, isDirty: false },
          ],
          activeFileIndex: state.openFiles.length,
          fileContent: result.data!.content,
          currentFile: { path, name: path.split('/').pop() || '', type: 'file' },
        }));
      }
    } catch {
      // Handle error
    }
  },

  closeFile: (index: number) => {
    set((state) => {
      const newOpenFiles = [...state.openFiles];
      newOpenFiles.splice(index, 1);

      let newActiveIndex = state.activeFileIndex;
      if (newOpenFiles.length === 0) {
        newActiveIndex = -1;
      } else if (index <= state.activeFileIndex) {
        newActiveIndex = Math.max(0, state.activeFileIndex - 1);
      }

      return {
        openFiles: newOpenFiles,
        activeFileIndex: newActiveIndex,
        fileContent:
          newActiveIndex >= 0 ? newOpenFiles[newActiveIndex].content : '',
      };
    });
  },

  setActiveFile: (index: number) => {
    const state = get();
    if (index >= 0 && index < state.openFiles.length) {
      set({
        activeFileIndex: index,
        fileContent: state.openFiles[index].content,
        currentFile: {
          path: state.openFiles[index].path,
          name: state.openFiles[index].path.split('/').pop() || '',
          type: 'file',
        },
      });
    }
  },

  updateFileContent: (content: string) => {
    set((state) => {
      if (state.activeFileIndex < 0) return state;

      const newOpenFiles = [...state.openFiles];
      newOpenFiles[state.activeFileIndex] = {
        ...newOpenFiles[state.activeFileIndex],
        content,
        isDirty: true,
      };

      return {
        openFiles: newOpenFiles,
        fileContent: content,
      };
    });
  },

  saveFile: async () => {
    const state = get();
    const session = state.currentSession;
    const activeFile = state.openFiles[state.activeFileIndex];

    if (!session || !activeFile) return;

    try {
      await filesApi.write(session.id, activeFile.path, activeFile.content);

      set((prevState) => {
        const newOpenFiles = [...prevState.openFiles];
        newOpenFiles[prevState.activeFileIndex] = {
          ...newOpenFiles[prevState.activeFileIndex],
          isDirty: false,
        };
        return { openFiles: newOpenFiles };
      });

      // Refresh git status
      get().loadGitStatus();
    } catch {
      // Handle error
    }
  },

  sendMessage: async (message: string, images?: ImageAttachment[]) => {
    const session = get().currentSession;
    if (!session) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      parts: [{ type: 'text', content: message }],
      images,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      streamingParts: [],
    }));

    // Strip [command:/name] UI prefix before sending to SDK.
    // The prefix is only for the chat UI chip display (MessageAttachments).
    // Sending it raw causes the SDK model to try invoking a Skill tool
    // (a Claude Code CLI feature that doesn't exist in the sandbox).
    const COMMAND_PREFIX_RE = /^\[command:\/([^\]]+)\]\n/;
    const cmdMatch = message.match(COMMAND_PREFIX_RE);
    let sdkMessage = message;
    if (cmdMatch) {
      const cmdName = cmdMatch[1];
      const cmdContent = message.slice(cmdMatch[0].length);
      sdkMessage = `The user is running the /${cmdName} command. Follow the instructions below:\n\n${cmdContent}`;
    }

    // Timeout: abort if no meaningful data within 5 min (matches backend)
    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 300000);
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), 300000);
    };

    try {
      // Use SDK streaming with structured MessagePart accumulation
      let content = '';
      const parts: MessagePart[] = [];
      let currentTextPart: MessagePart | null = null;
      let currentReasoningPart: MessagePart | null = null;
      // lastToolStart removed — artifact detection uses post-stream scan

      for await (const chunk of sdkApi.stream(
        session.id, sdkMessage, undefined, controller.signal
      )) {
        // Skip connection and heartbeat events — just reset the timeout
        if (chunk.type === 'connected' || chunk.type === 'heartbeat') {
          resetTimeout();
          continue;
        }

        if (chunk.type === 'text' && chunk.content) {
          resetTimeout();
          content += chunk.content;
          currentReasoningPart = null;

          // Accumulate text into the current text part
          if (!currentTextPart) {
            currentTextPart = { type: 'text', content: chunk.content };
            parts.push(currentTextPart);
          } else {
            const merged: MessagePart = {
              type: 'text',
              content: (currentTextPart.content || '') + chunk.content,
            };
            currentTextPart = merged;
            parts[parts.length - 1] = merged;
          }

          set({ streamingContent: content, streamingParts: [...parts] });
        } else if (chunk.type === 'reasoning' && chunk.content) {
          // Accumulate reasoning/thinking text
          resetTimeout();
          currentTextPart = null;

          if (!currentReasoningPart) {
            currentReasoningPart = { type: 'reasoning', content: chunk.content };
            parts.push(currentReasoningPart);
          } else {
            const merged: MessagePart = {
              type: 'reasoning',
              content: (currentReasoningPart.content || '') + chunk.content,
            };
            currentReasoningPart = merged;
            parts[parts.length - 1] = merged;
          }

          set({ streamingParts: [...parts] });
        } else if (chunk.type === 'tool-start' && chunk.name) {
          resetTimeout();
          currentTextPart = null;
          currentReasoningPart = null;
          const toolPart: MessagePart = {
            type: 'tool-start',
            name: chunk.name,
            input: (chunk as Record<string, unknown>).input as Record<string, unknown>,
            startedAt: Date.now(),
          };
          parts.push(toolPart);
          set({ streamingParts: [...parts] });
        } else if (chunk.type === 'tool-result' && chunk.name) {
          resetTimeout();
          currentTextPart = null;
          currentReasoningPart = null;

          // Find matching tool-start to compute duration
          const matchingStart = [...parts]
            .reverse()
            .find((p) => p.type === 'tool-start' && p.name === chunk.name);
          const duration = matchingStart?.startedAt
            ? Date.now() - matchingStart.startedAt
            : undefined;

          const resultPart: MessagePart = {
            type: 'tool-result',
            name: chunk.name,
            output: (chunk as Record<string, unknown>).output as string,
            duration,
          };
          parts.push(resultPart);
          set({ streamingParts: [...parts] });
        } else if (chunk.type === 'error' && chunk.content) {
          resetTimeout();
          currentTextPart = null;
          currentReasoningPart = null;
          parts.push({ type: 'error', content: chunk.content });
          set({ streamingParts: [...parts] });
          debugLog('stream', 'error', `Stream error: ${chunk.content}`);
        } else if (chunk.type === 'done') {
          // Stream completed normally
          resetTimeout();
        }
      }

      clearTimeout(timeoutId);

      // Post-stream: promote Write/Edit tool-starts to artifact blocks
      const artifactParts: MessagePart[] = [];
      for (const p of parts) {
        if (p.type !== 'tool-start') continue;
        const toolLower = (p.name || '').toLowerCase();
        if (toolLower !== 'write' && toolLower !== 'edit') continue;
        const input = p.input;
        const filePath = typeof input?.file_path === 'string'
          ? input.file_path
          : typeof input?.path === 'string'
            ? input.path
            : null;
        if (!filePath) continue;
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const lang = CODE_EXTS[ext];
        if (!lang) continue;
        const codeContent = typeof input?.content === 'string'
          ? input.content
          : typeof input?.new_string === 'string'
            ? input.new_string
            : null;
        if (!codeContent) continue;
        artifactParts.push({
          type: 'artifact',
          content: codeContent,
          language: lang,
          filename: filePath.split('/').pop() || filePath,
        });
      }
      parts.push(...artifactParts);

      // Handle empty response (stream ended but no content)
      if (!content && parts.length === 0) {
        parts.push({
          type: 'error',
          content: 'No response received. The sandbox may be sleeping — try again.',
        });
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        role: 'assistant',
        content: content || (parts.length > 0 ? '' : 'No response'),
        timestamp: new Date().toISOString(),
        parts: parts.length > 0 ? parts : [{ type: 'text', content }],
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
        streamingContent: '',
        streamingParts: [],
      }));

      // Refresh files in case Claude made changes
      get().loadFiles();
      get().loadGitStatus();
    } catch (error) {
      clearTimeout(timeoutId);

      // Show error in chat instead of silently swallowing
      const errorMsg = error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out — no response from sandbox within 5 min.'
        : error instanceof Error
          ? error.message
          : 'Stream failed';

      debugLog(
        'stream',
        'error',
        `sendMessage failed: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined
      );

      const errorMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        parts: [{ type: 'error', content: errorMsg }],
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
        isStreaming: false,
        streamingContent: '',
        streamingParts: [],
      }));
    }
  },

  clearMessages: () => set({ messages: [] }),

  loadGitStatus: async () => {
    const session = get().currentSession;
    if (!session) return;

    try {
      const result = await gitApi.status(session.id);
      if (result.success && result.data) {
        set({ gitStatus: result.data });
      }
    } catch {
      // Not a git repo, ignore
    }
  },

  stageFiles: async (files: string[]) => {
    const session = get().currentSession;
    if (!session) return;

    try {
      await gitApi.stage(session.id, files);
      get().loadGitStatus();
    } catch {
      // Handle error
    }
  },

  commitChanges: async (message: string) => {
    const session = get().currentSession;
    if (!session) return;

    try {
      await gitApi.commit(session.id, message);
      get().loadGitStatus();
    } catch {
      // Handle error
    }
  },

  execCommand: async (command: string) => {
    const session = get().currentSession;
    if (!session) return;

    // Prevent concurrent execution
    if (get().isExecuting) return;

    set((state) => ({
      terminalOutput: [...state.terminalOutput, `$ ${command}`],
      isExecuting: true,
    }));

    const trimmed = command.trim();
    const isShell = isShellCommand(trimmed);
    const isClaude = trimmed.startsWith('claude ') || trimmed === 'claude';
    const isUtility = isClaudeUtility(trimmed);

    try {
      if (!isShell && !isClaude) {
        // Path 1: Natural language -> SDK streaming (true progressive output)
        for await (const chunk of sdkApi.stream(session.id, trimmed)) {
          if (chunk.type === 'connected' || chunk.type === 'done' || chunk.type === 'heartbeat') continue;
          if (chunk.type === 'text' && chunk.content) {
            // Accumulate text into last output entry for progressive display
            set((state) => {
              const output = [...state.terminalOutput];
              const lastIdx = output.length - 1;
              const last = output[lastIdx];
              // Append to last line if it's SDK text, otherwise start new
              if (lastIdx >= 0 && !last.startsWith('$') && !last.startsWith('[')) {
                output[lastIdx] = last + chunk.content;
              } else {
                output.push(chunk.content!);
              }
              return { terminalOutput: output };
            });
          } else if (chunk.type === 'tool-start' && chunk.name) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, `[tool] ${chunk.name}`],
            }));
          } else if (chunk.type === 'tool-result' && chunk.name) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, `[done] ${chunk.name}`],
            }));
          } else if (chunk.type === 'error' && chunk.content) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, `Error: ${chunk.content}`],
            }));
          }
        }
        // Refresh files after SDK operations (may have edited files)
        get().loadFiles();
        get().loadGitStatus();
      } else if (isClaude && !isUtility) {
        // Path 2: Claude with prompt (claude -p "...") -> streaming
        // Auto-append -p if missing (no TTY in sandbox)
        let cmd = trimmed;
        if (cmd.startsWith('claude ') && !cmd.includes(' -p ') && !cmd.includes(' --print ')) {
          cmd = cmd.replace(/^claude /, 'claude -p ');
        }
        for await (const chunk of sessionsApi.execStream(session.id, cmd)) {
          if (chunk.type === 'stdout' && chunk.content) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, chunk.content!],
            }));
          } else if (chunk.type === 'stderr' && chunk.content) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, `[stderr] ${chunk.content}`],
            }));
          } else if (chunk.type === 'error' && chunk.content) {
            set((state) => ({
              terminalOutput: [...state.terminalOutput, `Error: ${chunk.content}`],
            }));
          }
        }
      } else {
        // Path 3: Shell commands + Claude utilities -> fast batch
        const result = await sessionsApi.exec(session.id, trimmed);
        if (result.success && result.data) {
          const { stdout, stderr } = result.data;
          set((state) => ({
            terminalOutput: [
              ...state.terminalOutput,
              ...(stdout ? [stdout] : []),
              ...(stderr ? [`[stderr] ${stderr}`] : []),
            ],
          }));
        }
      }
    } catch (error) {
      set((state) => ({
        terminalOutput: [
          ...state.terminalOutput,
          `Error: ${error instanceof Error ? error.message : 'Command failed'}`,
        ],
      }));
    } finally {
      set({ isExecuting: false });
    }
  },

  clearTerminal: () => set({ terminalOutput: [] }),

  uploadFiles: async (files: File[]) => {
    const session = get().currentSession;
    if (!session) return;

    const targetDir = get().currentPath;

    for (const file of files) {
      try {
        const content = await file.text();
        const filePath = `${targetDir}/${file.name}`;
        await filesApi.write(session.id, filePath, content);
      } catch {
        // Skip failed uploads
      }
    }

    get().loadFiles();
  },

  downloadFile: async (path: string) => {
    const session = get().currentSession;
    if (!session) return;

    try {
      const result = await filesApi.read(session.id, path);
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split('/').pop() || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Handle error
    }
  },

  downloadWorkspace: async () => {
    const session = get().currentSession;
    if (!session) return;

    try {
      const result = await filesApi.downloadArchive(session.id);
      if (result.success && result.data) {
        const binaryStr = atob(result.data.archive);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/gzip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Handle error
    }
  },
});

export const useSandboxStore = create<SandboxState>()(createSandboxStore);
