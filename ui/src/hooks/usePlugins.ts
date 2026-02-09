import { create } from 'zustand';
import { sessionsApi } from '@/lib/api';

/* ── Data model ───────────────────────────────────────── */

export interface PluginAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface PluginCommand {
  id: string;
  name: string;
  description: string;
  agentId?: string;       // Links to an agent in the same plugin
  shellCommand?: string;  // Optional shell command
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: 'local' | 'git';
  agents: PluginAgent[];
  commands: PluginCommand[];
  builtIn?: boolean;
  githubUrl?: string;
  rules?: string;
  readme?: string;
}

/* ── Starter templates ────────────────────────────────── */

const STARTER_PLUGINS: Plugin[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review code for quality, security, and best practices',
    enabled: false,
    scope: 'local',
    builtIn: true,
    agents: [
      {
        id: 'reviewer',
        name: 'Code Reviewer',
        description: 'Reviews code changes for quality and best practices',
        systemPrompt:
          'Review the code changes carefully. Check for bugs, security issues, performance problems, and adherence to best practices. Provide specific, actionable feedback.',
        enabled: true,
      },
    ],
    commands: [
      {
        id: 'review-cmd',
        name: '/review',
        description: 'Review staged changes',
        agentId: 'reviewer',
      },
    ],
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Generate comprehensive test suites for your code',
    enabled: false,
    scope: 'local',
    builtIn: true,
    agents: [
      {
        id: 'tester',
        name: 'Test Generator',
        description: 'Generates comprehensive test suites',
        systemPrompt:
          "Analyze the provided code and generate comprehensive test cases. Include unit tests, edge cases, and error scenarios. Use the project's existing test framework.",
        enabled: true,
      },
    ],
    commands: [
      {
        id: 'test-cmd',
        name: '/test',
        description: 'Generate tests for current file',
        agentId: 'tester',
      },
    ],
  },
  {
    id: 'docs-gen',
    name: 'Documentation',
    description: 'Auto-generate documentation and comments',
    enabled: false,
    scope: 'local',
    builtIn: true,
    agents: [
      {
        id: 'documenter',
        name: 'Doc Writer',
        description: 'Creates clear, comprehensive documentation',
        systemPrompt:
          'Generate clear documentation for the provided code. Include function signatures, parameter descriptions, return values, usage examples, and important notes about behavior.',
        enabled: true,
      },
    ],
    commands: [
      {
        id: 'doc-cmd',
        name: '/document',
        description: 'Generate docs for current file',
        agentId: 'documenter',
      },
    ],
  },
  {
    id: 'refactor',
    name: 'Refactoring',
    description: 'Suggest and apply code improvements',
    enabled: false,
    scope: 'local',
    builtIn: true,
    agents: [
      {
        id: 'refactorer',
        name: 'Refactoring Assistant',
        description: 'Identifies and applies code improvements',
        systemPrompt:
          'Analyze the code for refactoring opportunities. Look for duplicated code, overly complex logic, naming improvements, and structural changes that improve maintainability.',
        enabled: true,
      },
    ],
    commands: [
      {
        id: 'refactor-cmd',
        name: '/refactor',
        description: 'Suggest refactoring for current file',
        agentId: 'refactorer',
      },
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────── */

const CONFIG_PATH = '~/.vaporforge/plugins.json';
const GIT_CONFIG_PATH = '/workspace/.claude/plugins.json';

const genId = () => crypto.randomUUID().slice(0, 8);

function mergeStarters(saved: Plugin[]): Plugin[] {
  const savedIds = new Set(saved.map((p) => p.id));
  const merged = [...saved];
  for (const starter of STARTER_PLUGINS) {
    if (!savedIds.has(starter.id)) {
      merged.push({ ...starter });
    }
  }
  return merged;
}

/* ── Store ────────────────────────────────────────────── */

interface PluginsState {
  plugins: Plugin[];
  isLoading: boolean;

  loadPlugins: (sessionId: string) => Promise<void>;
  savePlugins: (sessionId: string, plugins?: Plugin[]) => Promise<void>;
  togglePlugin: (sessionId: string, pluginId: string) => void;
  removePlugin: (sessionId: string, pluginId: string) => void;
  addPlugin: (sessionId: string, plugin: Omit<Plugin, 'id'>) => void;
  updatePlugin: (sessionId: string, pluginId: string, updates: Partial<Plugin>) => void;
  setScope: (sessionId: string, pluginId: string, scope: 'local' | 'git') => void;
  installToScope: (sessionId: string, pluginId: string) => Promise<void>;
}

export const usePluginsStore = create<PluginsState>((set, get) => ({
  plugins: [],
  isLoading: false,

  loadPlugins: async (sessionId: string) => {
    set({ isLoading: true });
    try {
      const result = await sessionsApi.exec(
        sessionId,
        `cat ${CONFIG_PATH} 2>/dev/null || echo "[]"`
      );
      if (result.success && result.data) {
        const raw = result.data.stdout || '[]';
        const saved: Plugin[] = JSON.parse(raw);
        set({ plugins: mergeStarters(saved) });
      }
    } catch {
      set({ plugins: mergeStarters([]) });
    } finally {
      set({ isLoading: false });
    }
  },

  savePlugins: async (sessionId: string, pluginsOverride?: Plugin[]) => {
    const plugins = pluginsOverride || get().plugins;
    const json = JSON.stringify(plugins, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    await sessionsApi.exec(
      sessionId,
      `mkdir -p ~/.vaporforge && echo '${b64}' | base64 -d > ${CONFIG_PATH}`
    );
  },

  togglePlugin: (sessionId, pluginId) => {
    set((state) => {
      const updated = state.plugins.map((p) =>
        p.id === pluginId ? { ...p, enabled: !p.enabled } : p
      );
      return { plugins: updated };
    });
    get().savePlugins(sessionId);
    get().installToScope(sessionId, pluginId);
  },

  removePlugin: (sessionId, pluginId) => {
    set((state) => ({
      plugins: state.plugins.filter((p) => p.id !== pluginId),
    }));
    get().savePlugins(sessionId);
  },

  addPlugin: (sessionId, plugin) => {
    const full: Plugin = { ...plugin, id: genId() };
    set((state) => ({ plugins: [...state.plugins, full] }));
    get().savePlugins(sessionId);
  },

  updatePlugin: (sessionId, pluginId, updates) => {
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.id === pluginId ? { ...p, ...updates } : p
      ),
    }));
    get().savePlugins(sessionId);
  },

  setScope: (sessionId, pluginId, scope) => {
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.id === pluginId ? { ...p, scope } : p
      ),
    }));
    get().savePlugins(sessionId);
  },

  installToScope: async (sessionId, pluginId) => {
    const plugin = get().plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    const cmdDir =
      plugin.scope === 'git'
        ? '/workspace/.claude/commands'
        : '~/.claude/commands';

    if (plugin.enabled) {
      // Install: write command files for each plugin command
      for (const cmd of plugin.commands) {
        const agent = cmd.agentId
          ? plugin.agents.find((a) => a.id === cmd.agentId)
          : null;

        const content = [
          `# ${cmd.name}`,
          '',
          cmd.description,
          '',
          agent ? `## Agent: ${agent.name}` : '',
          agent ? '' : '',
          agent ? agent.systemPrompt : '',
        ]
          .filter(Boolean)
          .join('\n');

        const safeName = cmd.name.replace(/^\//, '').replace(/[^a-zA-Z0-9-_]/g, '-');
        const b64 = btoa(unescape(encodeURIComponent(content)));
        await sessionsApi.exec(
          sessionId,
          `mkdir -p ${cmdDir} && echo '${b64}' | base64 -d > ${cmdDir}/${safeName}.md`
        );
      }

      // For git scope, also write plugin config
      if (plugin.scope === 'git') {
        const gitPlugins = get().plugins.filter(
          (p) => p.scope === 'git' && p.enabled
        );
        const json = JSON.stringify(gitPlugins, null, 2);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        await sessionsApi.exec(
          sessionId,
          `mkdir -p /workspace/.claude && echo '${b64}' | base64 -d > ${GIT_CONFIG_PATH}`
        );
      }
    } else {
      // Uninstall: remove command files
      for (const cmd of plugin.commands) {
        const safeName = cmd.name.replace(/^\//, '').replace(/[^a-zA-Z0-9-_]/g, '-');
        await sessionsApi.exec(sessionId, `rm -f ${cmdDir}/${safeName}.md`);
      }
    }
  },
}));
