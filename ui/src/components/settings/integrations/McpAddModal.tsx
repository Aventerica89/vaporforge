import { useState } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { McpServerConfig } from '@/lib/types';
import { mcpApi } from '@/lib/api';

type Transport = 'stdio' | 'http' | 'relay';
type Mode = 'always' | 'on-demand' | 'auto';

export function McpAddModal() {
  const { showMcpAddModal, setShowMcpAddModal, addMcpServer } =
    useIntegrationsStore();

  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('http');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [mode, setMode] = useState<Mode>('always');
  const [saving, setSaving] = useState(false);

  if (!showMcpAddModal) return null;

  const reset = () => {
    setName('');
    setTransport('http');
    setCommand('');
    setUrl('');
    setLocalUrl('');
    setMode('always');
    setSaving(false);
  };

  const close = () => {
    reset();
    setShowMcpAddModal(false);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);

    const server: Omit<McpServerConfig, 'addedAt' | 'enabled'> = {
      name: trimmed,
      transport,
      mode,
      ...(transport === 'http' ? { url: url.trim() } : {}),
      ...(transport === 'stdio' ? { command: command.trim() } : {}),
      ...(transport === 'relay' ? { localUrl: localUrl.trim() } : {}),
    };

    await addMcpServer(server);

    // Auto-start OAuth if the server requires it (HTTP servers only)
    if (transport === 'http') {
      const added = useIntegrationsStore.getState().mcpServers.find((s) => s.name === trimmed);
      if (added?.requiresOAuth) {
        try {
          const res = await mcpApi.oauthStart(trimmed);
          if (res.success && res.data?.authUrl) {
            window.open(res.data.authUrl, '_blank');
          }
        } catch {
          // Non-critical — user can connect from the server detail panel
        }
      }
    }

    reset();
  };

  const canSave =
    name.trim() &&
    !saving &&
    (transport === 'http' ? url.trim() : true) &&
    (transport === 'stdio' ? command.trim() : true) &&
    (transport === 'relay' ? localUrl.trim() : true);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex w-[400px] max-h-[80vh] flex-col overflow-hidden rounded-md border border-border bg-[#0d1117] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="font-['Space_Mono'] text-sm font-semibold text-foreground">
            Add MCP Server
          </span>
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={close}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="px-6 pt-4 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground">
          Connect an MCP server to extend your workspace with additional tools and capabilities.
        </p>

        {/* Form */}
        <div className="flex flex-col gap-3.5 px-6 py-5">
          {/* Server Name */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
              Server Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-mcp-server"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-['Space_Mono'] text-xs text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              autoFocus
            />
          </div>

          {/* Transport */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
              Transport
            </label>
            <div className="flex gap-3">
              {(['http', 'stdio', 'relay'] as const).map((t) => (
                <button
                  key={t}
                  className={`rounded-full border px-3 py-1 font-['Space_Mono'] text-[11px] transition-all ${
                    transport === t
                      ? 'border-primary/30 bg-primary/5 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setTransport(t)}
                >
                  {t === 'http' ? 'HTTP' : t === 'stdio' ? 'Stdio' : 'Relay'}
                </button>
              ))}
            </div>
          </div>

          {/* Transport-specific field */}
          {transport === 'http' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
                Server URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mcp.example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-['Space_Mono'] text-xs text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              <p className="font-['Space_Mono'] text-[10px] text-muted-foreground">
                The HTTP endpoint for the MCP server
              </p>
            </div>
          )}

          {transport === 'stdio' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
                Command
              </label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx @modelcontextprotocol/server-filesystem /path"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-['Space_Mono'] text-xs text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              <p className="font-['Space_Mono'] text-[10px] text-muted-foreground">
                The command to start the MCP server process
              </p>
            </div>
          )}

          {transport === 'relay' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
                Local URL
              </label>
              <input
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://localhost:9222"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-['Space_Mono'] text-xs text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              <p className="font-['Space_Mono'] text-[10px] text-muted-foreground">
                Relay tunnels your local MCP server through VaporForge
              </p>
            </div>
          )}

          {/* Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['Space_Mono'] text-[11px] font-semibold text-foreground">
              Mode
            </label>
            <div className="flex gap-3">
              {(['always', 'on-demand', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  className={`rounded-full border px-3 py-1 font-['Space_Mono'] text-[11px] transition-all ${
                    mode === m
                      ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setMode(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            className="rounded border border-border bg-background px-4 py-1.5 font-['Space_Mono'] text-[11px] font-medium text-foreground transition-colors hover:bg-card"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-4 py-1.5 font-['Space_Mono'] text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            onClick={handleSave}
            disabled={!canSave}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {saving ? 'Adding...' : 'Add Server'}
          </button>
        </div>
      </div>
    </div>
  );
}
