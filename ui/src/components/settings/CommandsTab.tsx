import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, FileCode, Loader2, Save, X } from 'lucide-react';
import { sessionsApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';

interface CommandFile {
  name: string;
  content: string;
}

export function CommandsTab() {
  const [commands, setCommands] = useState<CommandFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCommand, setEditingCommand] = useState<CommandFile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const sessionId = useSandboxStore((s) => s.currentSession?.id);

  const loadCommands = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const result = await sessionsApi.exec(sessionId, 'ls ~/.claude/commands/ 2>/dev/null || echo ""');
      if (result.success && result.data) {
        const output = result.data.stdout || '';
        const files = output.trim().split('\n').filter((f: string) => f.endsWith('.md'));
        const loaded: CommandFile[] = [];
        for (const file of files) {
          const content = await sessionsApi.exec(sessionId, `cat ~/.claude/commands/${file}`);
          if (content.success && content.data) {
            loaded.push({ name: file.replace('.md', ''), content: content.data.stdout || '' });
          }
        }
        setCommands(loaded);
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const handleSave = async () => {
    if (!editingCommand || !sessionId) return;
    const filename = editingCommand.name.replace(/[^a-zA-Z0-9-_]/g, '-');
    try {
      await sessionsApi.exec(sessionId, 'mkdir -p ~/.claude/commands');
      // Write file content via base64 to avoid shell escaping issues
      const b64 = btoa(unescape(encodeURIComponent(editingCommand.content)));
      await sessionsApi.exec(
        sessionId,
        `echo '${b64}' | base64 -d > ~/.claude/commands/${filename}.md`
      );
      setEditingCommand(null);
      setIsNew(false);
      await loadCommands();
    } catch {
      // Save failed
    }
  };

  const handleDelete = async (name: string) => {
    if (!sessionId) return;
    try {
      await sessionsApi.exec(sessionId, `rm ~/.claude/commands/${name}.md`);
      await loadCommands();
    } catch {
      // Delete failed
    }
  };

  const handleNew = () => {
    setEditingCommand({
      name: '',
      content: '# New Command\n\nDescribe what this command does.\n',
    });
    setIsNew(true);
  };

  if (!sessionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Start a session to manage commands.
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

  if (editingCommand) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingCommand(null); setIsNew(false); }}
            className="rounded p-1 hover:bg-accent"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
            {isNew ? 'New Command' : `Edit: ${editingCommand.name}`}
          </h3>
        </div>

        {isNew && (
          <input
            type="text"
            value={editingCommand.name}
            onChange={(e) => setEditingCommand({ ...editingCommand, name: e.target.value })}
            placeholder="command-name"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
        )}

        <textarea
          value={editingCommand.content}
          onChange={(e) => setEditingCommand({ ...editingCommand, content: e.target.value })}
          className="min-h-[200px] w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs focus:border-primary focus:outline-none"
          spellCheck={false}
        />

        <button
          onClick={handleSave}
          className="btn-primary flex items-center gap-1.5 self-end px-3 py-1.5 text-xs"
        >
          <Save className="h-3 w-3" />
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <FileCode className="h-4 w-4 text-primary" />
          Slash Commands
        </h3>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Plus className="h-3.5 w-3.5 text-primary" />
          Add
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Custom slash commands in <code className="text-primary">~/.claude/commands/</code>.
        Use <code className="text-primary">/command-name</code> in chat.
      </p>

      {commands.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No commands yet</p>
      ) : (
        <div className="space-y-1">
          {commands.map((cmd) => (
            <div
              key={cmd.name}
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <button
                onClick={() => { setEditingCommand(cmd); setIsNew(false); }}
                className="flex items-center gap-2 text-sm"
              >
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono">/{cmd.name}</span>
              </button>
              <button
                onClick={() => handleDelete(cmd.name)}
                className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
