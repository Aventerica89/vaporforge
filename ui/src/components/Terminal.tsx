import { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Trash2, X } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';

// Known shell commands — anything not matching gets wrapped as claude -p "..."
const SHELL_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'mkdir', 'rmdir',
  'rm', 'cp', 'mv', 'touch', 'chmod', 'chown', 'ln', 'env', 'export',
  'which', 'whoami', 'hostname', 'date', 'uname', 'df', 'du', 'free',
  'top', 'ps', 'kill', 'curl', 'wget', 'tar', 'zip', 'unzip', 'gzip',
  'ssh', 'scp', 'git', 'npm', 'npx', 'node', 'python', 'python3',
  'pip', 'pip3', 'claude', 'docker', 'wrangler', 'head', 'tail',
  'sed', 'awk', 'sort', 'uniq', 'wc', 'diff', 'patch', 'file',
  'stat', 'test', 'true', 'false', 'sleep', 'clear', 'man',
  'apt', 'apt-get', 'sudo', 'su', 'id', 'groups', 'printenv',
  'set', 'unset', 'source', 'bash', 'sh', 'zsh', 'tee', 'xargs',
  'tr', 'cut', 'paste', 'vi', 'vim', 'nano', 'less', 'more',
]);

function isShellCommand(input: string): boolean {
  const firstWord = input.split(/\s+/)[0];
  if (SHELL_COMMANDS.has(firstWord)) return true;
  if (firstWord.startsWith('./') || firstWord.startsWith('/')) return true;
  if (firstWord.startsWith('~')) return true;
  if (firstWord.includes('=')) return true; // env var assignment
  return false;
}

export function Terminal() {
  const { terminalOutput, execCommand, clearTerminal, isExecuting } = useSandboxStore();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting) return;

    let command = input.trim();

    // Auto-wrap naked messages as claude -p "..." if not a shell command
    if (!isShellCommand(command)) {
      const escaped = command.replace(/"/g, '\\"');
      command = `claude -p "${escaped}"`;
    }

    // Auto-append -p for bare `claude "prompt"` (no TTY available in sandbox)
    if (
      command.startsWith('claude ') &&
      !command.includes(' -p ') &&
      !command.includes(' --print ')
    ) {
      command = command.replace(/^claude /, 'claude -p ');
    }

    setHistory((prev) => [...prev, command]);
    setHistoryIndex(-1);
    setInput('');
    await execCommand(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex =
          historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      setInput('');
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      className="flex h-full flex-col bg-[#1e1e1e] font-mono text-sm"
      onClick={handleContainerClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Terminal
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearTerminal}
            className="rounded p-1 hover:bg-[#333]"
            title="Clear terminal"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="rounded p-1 hover:bg-[#333]" title="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Output */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-3">
        {terminalOutput.length === 0 ? (
          <div className="text-muted-foreground">
            <p>Welcome to VaporForge Terminal</p>
            <p className="mt-1 text-xs">
              Type naturally to ask Claude, or use shell commands
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {terminalOutput.map((line, index) => (
              <div
                key={index}
                className={`whitespace-pre-wrap break-all ${
                  line.startsWith('$')
                    ? 'text-green-400'
                    : line.startsWith('[stderr]')
                      ? 'text-red-400'
                      : line.startsWith('Error')
                        ? 'text-red-400'
                        : 'text-gray-300'
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#333] p-2">
        {isExecuting ? (
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-yellow-400">...</span>
            <span className="text-xs text-gray-500">Running command</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              className="flex-1 bg-transparent text-gray-300 placeholder:text-gray-600 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        )}
      </div>
    </div>
  );
}
