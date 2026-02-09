import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Server, Loader2, X, AlertCircle } from 'lucide-react';
import { sessionsApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';

interface McpServer {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  type?: string;
}

export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', url: '', command: '' });
  const [error, setError] = useState('');
  const sessionId = useSandboxStore((s) => s.currentSession?.id);

  // Read raw config from ~/.claude.json
  const readConfig = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!sessionId) return {};
    try {
      const result = await sessionsApi.exec(
        sessionId,
        'cat ~/.claude.json 2>/dev/null || echo "{}"'
      );
      if (result.success && result.data) {
        return JSON.parse(result.data.stdout || '{}');
      }
    } catch {
      // File doesn't exist or parse error
    }
    return {};
  }, [sessionId]);

  // Write config back to ~/.claude.json
  const writeConfig = async (config: Record<string, unknown>) => {
    if (!sessionId) return;
    const json = JSON.stringify(config, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    await sessionsApi.exec(
      sessionId,
      \`echo '\${b64}' | base64 -d > ~/.claude.json\`
    );
  };

  const loadServers = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError('');
    try {
      const config = await readConfig();
      const mcpServers = (config.mcpServers || {}) as Record<string, Record<string, unknown>>;
      const list: McpServer[] = Object.entries(mcpServers).map(
        ([name, v]) => ({
          name,
          command: v.command as string | undefined,
          args: v.args as string[] | undefined,
          url: v.url as string | undefined,
          type: v.type as string | undefined,
        })
      );
      setServers(list);
    } catch {
      setError('Failed to load MCP config');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, readConfig]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAdd = async () => {
    if (!sessionId || !newServer.name) return;
    if (!newServer.url && !newServer.command) return;

    setIsSaving(true);
    setError('');

    try {
      console.log('[McpTab] Adding server:', newServer);

      // Read existing config, add server, write back
      const config = await readConfig();
      const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;

      if (newServer.url) {
        console.log('[McpTab] Adding HTTP server:', newServer.name, newServer.url);
        mcpServers[newServer.name] = {
          type: 'http',
          url: newServer.url,
        };
      } else {
        const parts = newServer.command.split(/\s+/);
        console.log('[McpTab] Adding stdio server:', newServer.name, parts[0], parts.slice(1));
        mcpServers[newServer.name] = {
          command: parts[0],
          args: parts.slice(1),
        };
      }

      config.mcpServers = mcpServers;
      await writeConfig(config);

      console.log('[McpTab] Server added successfully');
      setShowAdd(false);
      setNewServer({ name: '', url: '', command: '' });
      await loadServers();
    } catch (err) {
      console.error('[McpTab] Error adding server:', err);
      setError(err instanceof Error ? err.message : 'Failed to add server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!sessionId) return;
    setError('');

    try {
      const config = await readConfig();
      const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;
      delete mcpServers[name];
      config.mcpServers = mcpServers;
      await writeConfig(config);
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove server');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Server className="h-4 w-4 text-primary" />
          MCP Servers
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          disabled={!sessionId}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: '36px' }}
          title={!sessionId ? 'Start a session to manage MCP servers' : ''}
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4 text-primary" />}
          {showAdd ? 'Cancel' : 'Add Server'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        MCP servers from <code className="text-primary">~/.claude.json</code>.
        Claude can use tools from these servers.
      </p>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {showAdd && sessionId && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input
            type="text"
            value={newServer.name}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            placeholder="Server name"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
            autoFocus
          />
          <input
            type="text"
            value={newServer.url}
            onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
            placeholder="HTTP URL (for remote servers)"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
          <input
            type="text"
            value={newServer.command}
            onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
            placeholder="Command (for local servers, e.g. npx server)"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Provide either a URL (HTTP transport) or a command (stdio transport).
          </p>
          <button
            onClick={handleAdd}
            disabled={!newServer.name || (!newServer.url && !newServer.command) || isSaving}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {isSaving ? 'Adding...' : 'Add Server'}
          </button>
        </div>
      )}

      {!sessionId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Start a session to manage MCP servers
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No MCP servers configured</p>
      ) : (
        <div className="space-y-1">
          {servers.map((server) => (
            <div
              key={server.name}
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="text-sm font-medium truncate">{server.name}</span>
                  {server.type && (
                    <span className="text-[9px] font-mono uppercase text-muted-foreground/50 border border-border rounded px-1 py-px">
                      {server.type}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate pl-[22px] text-[10px] text-muted-foreground font-mono">
                  {server.url || (server.command ? \`\${server.command} \${(server.args || []).join(' ')}\` : 'stdio')}
                </p>
              </div>
              <button
                onClick={() => handleRemove(server.name)}
                className="ml-2 flex-shrink-0 rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
