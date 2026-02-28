import { useState } from 'react';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { McpServerConfig } from '@/lib/types';

type Transport = 'stdio' | 'http';
type Mode = 'always' | 'on-demand' | 'auto';

export function McpAddModal() {
  const { showMcpAddModal, setShowMcpAddModal, addMcpServer } =
    useIntegrationsStore();

  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('stdio');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<Mode>('always');
  const [saving, setSaving] = useState(false);

  if (!showMcpAddModal) return null;

  const reset = () => {
    setName('');
    setTransport('stdio');
    setCommand('');
    setUrl('');
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
      ...(transport === 'http' ? { url: url.trim() } : { command: command.trim() }),
    };

    await addMcpServer(server);
    reset();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[400px] max-h-[80vh] overflow-y-auto rounded-md border border-border bg-card/95 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
          <span className="text-xs font-bold text-foreground">
            Add MCP Server
          </span>
          <button
            className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={close}
          >
            [x]
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3.5 p-4.5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-database"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              autoFocus
            />
          </div>

          {/* Transport */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Transport
            </label>
            <div className="flex gap-3.5">
              {(['stdio', 'http'] as const).map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="transport"
                    checked={transport === t}
                    onChange={() => setTransport(t)}
                    className="accent-primary"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {/* Command (stdio) or URL (http) */}
          {transport === 'stdio' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Command
              </label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npx @modelcontextprotocol/server-filesystem /path"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. https://my-mcp.example.com/sse"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          )}

          {/* Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Mode
            </label>
            <div className="flex gap-3.5">
              {(['always', 'on-demand', 'auto'] as const).map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="accent-primary"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border px-4.5 py-3.5">
          <button
            className="rounded-sm border border-border px-3.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="rounded-sm border border-primary/30 bg-primary/10 px-3.5 py-1 font-mono text-[10px] font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Adding...' : 'Add Server'}
          </button>
        </div>
      </div>
    </div>
  );
}
