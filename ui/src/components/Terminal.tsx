import { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Trash2, X } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';

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

    const command = input.trim();
    // Store raw input in history; routing is handled by the store
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
                    : line.startsWith('[tool]')
                      ? 'text-cyan-400'
                      : line.startsWith('[done]')
                        ? 'text-gray-500'
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
