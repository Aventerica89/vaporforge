import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Blocks,
  Bot,
  Terminal,
  ArrowRight,
  Save,
  GitBranch,
  HardDrive,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { usePluginsStore } from '@/hooks/usePlugins';
import type { Plugin, PluginAgent, PluginCommand } from '@/hooks/usePlugins';
import { ReadmeModal } from '../ReadmeModal';

/* ── Main Tab ─────────────────────────────────────────── */

export function PluginsTab() {
  const sessionId = useSandboxStore((s) => s.currentSession?.id);
  const { plugins, isLoading, loadPlugins, togglePlugin, removePlugin, addPlugin } =
    usePluginsStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(() => {
    if (sessionId) loadPlugins(sessionId);
  }, [sessionId, loadPlugins]);

  useEffect(() => {
    load();
  }, [load]);

  const enabledCount = plugins.filter((p) => p.enabled).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Blocks className="h-4 w-4 text-primary" />
          Plugins & Agents
          {enabledCount > 0 && (
            <span className="text-[10px] font-mono text-primary/60">
              {enabledCount} active
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={!sessionId}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: '36px' }}
          title={!sessionId ? 'Start a session to manage plugins and agents' : ''}
        >
          {showAddForm ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4 text-primary" />
          )}
          {showAddForm ? 'Cancel' : 'New Plugin'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Plugins bundle agents and commands together. Enable a plugin to install
        its commands. Toggle scope between{' '}
        <span className="text-primary">local</span> (sandbox only) or{' '}
        <span className="text-secondary">git</span> (committed to repo).
      </p>

      {/* Add form */}
      {showAddForm && sessionId && (
        <AddPluginForm
          onAdd={(plugin) => {
            addPlugin(sessionId, plugin);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Content */}
      {!sessionId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Start a session to manage plugins and agents
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : plugins.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No plugins configured
        </p>
      ) : (
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              expanded={expandedId === plugin.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === plugin.id ? null : plugin.id)
              }
              onToggle={() => togglePlugin(sessionId, plugin.id)}
              onRemove={() => removePlugin(sessionId, plugin.id)}
              sessionId={sessionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Plugin Card ──────────────────────────────────────── */

// Color palette for agent dots (deterministic by index)
const AGENT_COLORS = [
  'bg-cyan-400',
  'bg-violet-400',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-rose-400',
  'bg-blue-400',
];

function PluginCard({
  plugin,
  expanded,
  onToggleExpand,
  onToggle,
  onRemove,
  sessionId,
}: {
  plugin: Plugin;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onRemove: () => void;
  sessionId: string;
}) {
  const { setScope } = usePluginsStore();
  const [showReadme, setShowReadme] = useState(false);

  // Build agent color map
  const agentColors: Record<string, string> = {};
  plugin.agents.forEach((a, i) => {
    agentColors[a.id] = AGENT_COLORS[i % AGENT_COLORS.length];
  });

  return (
    <>
      {plugin.readme && (
        <ReadmeModal
          isOpen={showReadme}
          onClose={() => setShowReadme(false)}
          content={plugin.readme}
          title={`${plugin.name} - README`}
        />
      )}

      <div
        className={`rounded-lg border transition-colors ${
          plugin.enabled
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-card/50'
        }`}
      >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">
              {plugin.name}
            </span>
            {plugin.builtIn && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 border border-border rounded px-1 py-px">
                built-in
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {plugin.description}
          </p>
        </button>

        {/* Scope badge */}
        <button
          onClick={() =>
            setScope(
              sessionId,
              plugin.id,
              plugin.scope === 'local' ? 'git' : 'local'
            )
          }
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide transition-colors ${
            plugin.scope === 'git'
              ? 'bg-secondary/15 text-secondary border border-secondary/30'
              : 'bg-primary/10 text-primary/70 border border-primary/20'
          }`}
          title={
            plugin.scope === 'local'
              ? 'Local to sandbox — click to switch to git'
              : 'Installed to repo — click to switch to local'
          }
        >
          {plugin.scope === 'git' ? (
            <GitBranch className="h-3 w-3" />
          ) : (
            <HardDrive className="h-3 w-3" />
          )}
          {plugin.scope}
        </button>

        {/* Enable/disable toggle */}
        <button
          onClick={onToggle}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
            plugin.enabled ? 'bg-primary' : 'bg-border'
          }`}
          role="switch"
          aria-checked={plugin.enabled}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              plugin.enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-4">
          {/* Agents */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground/60">
              <Bot className="h-3 w-3" />
              Agents ({plugin.agents.length})
            </div>
            {plugin.agents.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 pl-4">
                No agents
              </p>
            ) : (
              <div className="space-y-1 pl-1">
                {plugin.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        agentColors[agent.id]
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commands with agent connections */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground/60">
              <Terminal className="h-3 w-3" />
              Commands ({plugin.commands.length})
            </div>
            {plugin.commands.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 pl-4">
                No commands
              </p>
            ) : (
              <div className="space-y-1 pl-1">
                {plugin.commands.map((cmd) => {
                  const linkedAgent = cmd.agentId
                    ? plugin.agents.find((a) => a.id === cmd.agentId)
                    : null;
                  const agentColor = cmd.agentId
                    ? agentColors[cmd.agentId]
                    : null;

                  return (
                    <div
                      key={cmd.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      <span className="font-mono text-sm text-primary font-medium">
                        {cmd.name}
                      </span>
                      {linkedAgent && (
                        <>
                          <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/40" />
                          <span
                            className={`flex items-center gap-1.5 text-xs text-muted-foreground`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${agentColor}`}
                            />
                            {linkedAgent.name}
                          </span>
                        </>
                      )}
                      {!linkedAgent && cmd.shellCommand && (
                        <span className="font-mono text-[11px] text-muted-foreground/50 truncate">
                          $ {cmd.shellCommand}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Installation Rules */}
          {plugin.rules && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground/60">
                <BookOpen className="h-3 w-3" />
                Installation Rules
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {plugin.rules}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <div className="flex items-center gap-2">
              {plugin.readme && (
                <button
                  onClick={() => setShowReadme(true)}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  View README
                </button>
              )}
              {plugin.githubUrl && (
                <a
                  href={plugin.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  GitHub
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!plugin.builtIn && (
                <button
                  onClick={onRemove}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

/* ── Add Plugin Form ──────────────────────────────────── */

function AddPluginForm({
  onAdd,
  onCancel,
}: {
  onAdd: (plugin: Omit<Plugin, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [rules, setRules] = useState('');
  const [readme, setReadme] = useState('');
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [scope, setScope] = useState<'local' | 'git'>('local');
  const [agents, setAgents] = useState<PluginAgent[]>([]);
  const [commands, setCommands] = useState<PluginCommand[]>([]);

  const addAgent = () => {
    setAgents([
      ...agents,
      {
        id: crypto.randomUUID().slice(0, 8),
        name: '',
        description: '',
        systemPrompt: '',
        enabled: true,
      },
    ]);
  };

  const updateAgent = (idx: number, updates: Partial<PluginAgent>) => {
    setAgents(agents.map((a, i) => (i === idx ? { ...a, ...updates } : a)));
  };

  const removeAgent = (idx: number) => {
    const removed = agents[idx];
    setAgents(agents.filter((_, i) => i !== idx));
    // Unlink commands that referenced this agent
    setCommands(
      commands.map((c) =>
        c.agentId === removed.id ? { ...c, agentId: undefined } : c
      )
    );
  };

  const addCommand = () => {
    setCommands([
      ...commands,
      {
        id: crypto.randomUUID().slice(0, 8),
        name: '/',
        description: '',
      },
    ]);
  };

  const updateCommand = (idx: number, updates: Partial<PluginCommand>) => {
    setCommands(commands.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  const removeCommand = (idx: number) => {
    setCommands(commands.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      description: description.trim(),
      enabled: true,
      scope,
      agents,
      commands,
      githubUrl: githubUrl.trim() || undefined,
      rules: rules.trim() || undefined,
      readme: readme.trim() || undefined,
    });
  };

  return (
    <>
      <ReadmeModal
        isOpen={showReadmeModal}
        onClose={() => setShowReadmeModal(false)}
        content={readme}
        title="Plugin README Preview"
      />

      <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h4 className="font-display text-xs font-bold uppercase tracking-wider text-primary">
          New Plugin
        </h4>

      {/* Basic info */}
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Plugin name"
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
          autoFocus
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            GitHub Repository
            <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Scope */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Scope:</span>
        <button
          onClick={() => setScope('local')}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-mono uppercase transition-colors ${
            scope === 'local'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          <HardDrive className="h-3 w-3" />
          Local
        </button>
        <button
          onClick={() => setScope('git')}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-mono uppercase transition-colors ${
            scope === 'git'
              ? 'bg-secondary/15 text-secondary border border-secondary/30'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          <GitBranch className="h-3 w-3" />
          Git
        </button>
      </div>

      {/* Agents section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
            <Bot className="h-3 w-3" />
            Agents
          </span>
          <button
            onClick={addAgent}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {agents.map((agent, idx) => (
          <div
            key={agent.id}
            className="space-y-1.5 rounded-md border border-border bg-muted/50 p-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  AGENT_COLORS[idx % AGENT_COLORS.length]
                }`}
              />
              <input
                type="text"
                value={agent.name}
                onChange={(e) => updateAgent(idx, { name: e.target.value })}
                placeholder="Agent name"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => removeAgent(idx)}
                className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={agent.description}
              onChange={(e) =>
                updateAgent(idx, { description: e.target.value })
              }
              placeholder="Description"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            />
            <textarea
              value={agent.systemPrompt}
              onChange={(e) =>
                updateAgent(idx, { systemPrompt: e.target.value })
              }
              placeholder="System prompt / instructions for this agent..."
              className="w-full resize-none rounded border border-border bg-background p-2 font-mono text-[11px] leading-relaxed focus:border-primary focus:outline-none"
              rows={3}
            />
          </div>
        ))}
      </div>

      {/* Commands section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
            <Terminal className="h-3 w-3" />
            Commands
          </span>
          <button
            onClick={addCommand}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {commands.map((cmd, idx) => (
          <div
            key={cmd.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-2.5"
          >
            <input
              type="text"
              value={cmd.name}
              onChange={(e) => updateCommand(idx, { name: e.target.value })}
              placeholder="/command"
              className="w-24 flex-shrink-0 rounded border border-border bg-background px-2 py-1 font-mono text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={cmd.description}
              onChange={(e) =>
                updateCommand(idx, { description: e.target.value })
              }
              placeholder="Description"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            />
            {/* Agent link dropdown */}
            {agents.length > 0 && (
              <select
                value={cmd.agentId || ''}
                onChange={(e) =>
                  updateCommand(idx, {
                    agentId: e.target.value || undefined,
                  })
                }
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
              >
                <option value="">No agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || 'Unnamed'}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => removeCommand(idx)}
              className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Rules section */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
          <BookOpen className="h-3 w-3" />
          Installation Rules
          <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
        </label>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder="Installation instructions, requirements, or setup notes..."
          className="w-full resize-none rounded-lg border border-border bg-muted p-3 text-xs leading-relaxed focus:border-primary focus:outline-none"
          rows={3}
        />
      </div>

      {/* README section */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
          <BookOpen className="h-3 w-3" />
          README Content
          <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
        </label>
        <textarea
          value={readme}
          onChange={(e) => setReadme(e.target.value)}
          placeholder="Plugin README in markdown format..."
          className="w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
          rows={4}
        />
        {readme.trim() && (
          <button
            onClick={() => setShowReadmeModal(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Preview README
          </button>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Create Plugin
        </button>
      </div>
      </div>
    </>
  );
}
