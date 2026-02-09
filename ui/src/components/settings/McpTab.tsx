import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Server,
  Loader2,
  X,
  Globe,
  Terminal,
} from 'lucide-react';
import { mcpApi } from '@/lib/api';
import type { McpServerConfig } from '@/lib/types';

type Transport = 'http' | 'stdio';

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateName(name: string): string | null {
  if (!name) return 'Name is required';
  if (name.length > 100) return 'Name must be 100 characters or fewer';
  if (!NAME_REGEX.test(name)) return 'Only letters, numbers, dashes, underscores';
  return null;
}

function validateUrl(url: string): string | null {
  if (!url) return 'URL is required for HTTP transport';
  try {
    new URL(url);
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

export function McpTab() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [transport, setTransport] = useState<Transport>('http');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await mcpApi.list();
      if (result.success && result.data) {
        setServers(result.data);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const resetForm = () => {
    setName('');
    setUrl('');
    setCommand('');
    setError('');
    setNameError('');
    setTransport('http');
    setShowAdd(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError('');
    setError('');
  };

  const handleAdd = async () => {
    const nameErr = validateName(name);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }

    if (transport === 'http') {
      const urlErr = validateUrl(url);
      if (urlErr) {
        setError(urlErr);
        return;
      }
    } else if (!command.trim()) {
      setError('Command is required for stdio transport');
      return;
    }

    setIsAdding(true);
    setError('');
    try {
      const server: { name: string; transport: Transport; url?: string; command?: string; args?: string[] } = {
        name,
        transport,
      };

      if (transport === 'http') {
        server.url = url;
      } else {
        const parts = command.trim().split(/\s+/);
        server.command = parts[0];
        if (parts.length > 1) {
          server.args = parts.slice(1);
        }
      }

      const result = await mcpApi.add(server);
      if (result.success) {
        resetForm();
        await loadServers();
      } else {
        setError(result.error || 'Failed to add server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (serverName: string) => {
    try {
      await mcpApi.remove(serverName);
      await loadServers();
    } catch {
      // Remove failed
    }
  };

  const handleToggle = async (serverName: string) => {
    try {
      await mcpApi.toggle(serverName);
      await loadServers();
    } catch {
      // Toggle failed
    }
  };

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
          {servers.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {servers.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(''); setNameError(''); }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-primary" />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        MCP servers are persisted and injected into every new session.
        No active session required.
      </p>

      {showAdd && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          {/* Transport toggle */}
          <div className="flex gap-1 rounded-md bg-muted p-0.5">
            <button
              onClick={() => { setTransport('http'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                transport === 'http'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe className="h-3 w-3" />
              HTTP
            </button>
            <button
              onClick={() => { setTransport('stdio'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                transport === 'stdio'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-3 w-3" />
              stdio
            </button>
          </div>

          {/* Name input */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Server name (e.g. my-server)"
              className={`w-full rounded border bg-muted px-3 py-2 text-sm focus:outline-none ${
                nameError
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-border focus:border-primary'
              }`}
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-400">{nameError}</p>
            )}
          </div>

          {/* Transport-specific input */}
          {transport === 'http' ? (
            <div>
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="https://mcp.example.com/sse"
                className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Full URL of the HTTP MCP server endpoint
              </p>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={command}
                onChange={(e) => { setCommand(e.target.value); setError(''); }}
                placeholder="node /path/to/server.js --flag"
                className="w-full rounded border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Command and arguments to start the stdio MCP server
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={handleAdd}
            disabled={!name || (transport === 'http' ? !url : !command) || isAdding}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add Server
          </button>
        </div>
      )}

      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No MCP servers configured
        </p>
      ) : (
        <div className="space-y-1">
          {servers.map((server) => (
            <div
              key={server.name}
              className={`group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors ${
                !server.enabled ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="text-sm font-medium truncate">{server.name}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    server.transport === 'http'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {server.transport}
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-[22px] text-[10px] text-muted-foreground font-mono">
                  {server.url || server.command || 'stdio'}
                </p>
              </div>

              <div className="ml-2 flex items-center gap-1.5">
                {/* Toggle switch */}
                <button
                  onClick={() => handleToggle(server.name)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    server.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                  title={server.enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      server.enabled ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleRemove(server.name)}
                  className="flex-shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
