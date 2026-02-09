import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Server, Loader2, X } from 'lucide-react';
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
  const [showAdd, setShowAdd] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', url: '', command: '' });
  const sessionId = useSandboxStore((s) => s.currentSession?.id);

  const loadServers = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const result = await sessionsApi.exec(
        sessionId,
        'cat ~/.claude.json 2>/dev/null || echo "{}"'
      );
      if (result.success && result.data) {
        const output = result.data.stdout || '{}';
        const config = JSON.parse(output);
        const mcpServers = config.mcpServers || {};
        const list: McpServer[] = Object.entries(mcpServers).map(
          ([name, value]: [string, unknown]) => {
            const v = value as Record<string, unknown>;
            return {
              name,
              command: v.command as string | undefined,
              args: v.args as string[] | undefined,
              url: v.url as string | undefined,
              type: v.type as string | undefined,
            };
          }
        );
        setServers(list);
      }
    } catch {
      // Parse failed
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAdd = async () => {
    if (!sessionId || !newServer.name) return;
    try {
      if (newServer.url) {
        await sessionsApi.exec(
          sessionId,
          `claude mcp add --transport http "${newServer.name}" "${newServer.url}"`
        );
      } else if (newServer.command) {
        const parts = newServer.command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1).map((a) => `"${a}"`).join(' ');
        await sessionsApi.exec(
          sessionId,
          `claude mcp add "${newServer.name}" -- ${cmd} ${args}`
        );
      }
      setShowAdd(false);
      setNewServer({ name: '', url: '', command: '' });
      await loadServers();
    } catch {
      // Add failed
    }
  };

  const handleRemove = async (name: string) => {
    if (!sessionId) return;
    try {
      await sessionsApi.exec(sessionId, `claude mcp remove "${name}"`);
      await loadServers();
    } catch {
      // Remove failed
    }
  };

  if (!sessionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Start a session to manage MCP servers.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Server className="h-4 w-4 text-primary" />
          MCP Servers
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          style={{ minHeight: '36px' }}
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4 text-primary" />}
          {showAdd ? 'Cancel' : 'Add Server'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        MCP servers from <code className="text-primary">~/.claude.json</code>.
        Claude can use tools from these servers.
      </p>

      {showAdd && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input
            type="text"
            value={newServer.name}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            placeholder="Server name"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
            placeholder="Command (for local servers, e.g. node server.js)"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Provide either a URL (HTTP transport) or a command (stdio transport).
          </p>
          <button
            onClick={handleAdd}
            disabled={!newServer.name || (!newServer.url && !newServer.command)}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add Server
          </button>
        </div>
      )}

      {servers.length === 0 ? (
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
                </div>
                <p className="mt-0.5 truncate pl-[22px] text-[10px] text-muted-foreground font-mono">
                  {server.url || server.command || 'stdio'}
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
