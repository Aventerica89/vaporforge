import { useState, useRef, useEffect } from 'react';
import { Send, Undo2, FileCode, Globe, Terminal } from 'lucide-react';

interface SelectedComponent {
  component: string;
  file: string;
  elementTag?: string;
  elementHTML?: string;
  elementText?: string;
}

interface EditEntry {
  id: string;
  instruction: string;
  component: string | null;
  timestamp: number;
}

interface Props {
  selectedComponent: SelectedComponent | null;
  siteId: string | null;
  onSendEdit: (instruction: string, componentFile: string | null, elementHTML: string | null) => void;
  isStreaming: boolean;
  streamingOutput: string;
}

export function EditPanel({
  selectedComponent,
  siteId,
  onSendEdit,
  isStreaming,
  streamingOutput,
}: Props) {
  const [instruction, setInstruction] = useState('');
  const [editHistory, setEditHistory] = useState<EditEntry[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedComponent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed || !siteId || isStreaming) return;

    const entry: EditEntry = {
      id: crypto.randomUUID().slice(0, 8),
      instruction: trimmed,
      component: selectedComponent?.component ?? null,
      timestamp: Date.now(),
    };
    setEditHistory((prev) => [entry, ...prev]);
    onSendEdit(trimmed, selectedComponent?.file || null, selectedComponent?.elementHTML ?? null);
    setInstruction('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const elementLabel = selectedComponent
    ? selectedComponent.elementTag
      ? selectedComponent.elementText
        ? `${selectedComponent.elementTag} "${selectedComponent.elementText}" in ${selectedComponent.component}`
        : `${selectedComponent.elementTag} in ${selectedComponent.component}`
      : selectedComponent.component
    : null;

  return (
    <div className="flex w-[320px] shrink-0 flex-col border-l border-zinc-700 bg-zinc-900">
      {/* Header: selected component info */}
      <div className="flex h-10 items-center gap-2 border-b border-zinc-700 px-3">
        {selectedComponent ? (
          <>
            <FileCode className="h-3.5 w-3.5 text-purple-400" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-purple-300">
                {elementLabel}
              </span>
            </div>
          </>
        ) : (
          <>
            <Globe className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-400">
              Site-wide edit
            </span>
          </>
        )}
      </div>

      {/* File path */}
      {selectedComponent && (
        <div className="border-b border-zinc-800 px-3 py-1.5">
          <span className="font-mono text-[10px] text-zinc-500">
            {selectedComponent.file}
          </span>
        </div>
      )}

      {/* Streaming output — shown while AI is working */}
      {isStreaming && streamingOutput && (
        <div className="border-b border-zinc-800 bg-zinc-950 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <Terminal className="h-3 w-3 text-cyan-500" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-600">
              Agent working...
            </span>
          </div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-zinc-400">
            {streamingOutput}
          </pre>
        </div>
      )}

      {/* Edit history */}
      <div className="flex-1 overflow-y-auto p-2">
        {editHistory.length === 0 ? (
          <div className="px-2 py-8 text-center text-[11px] text-zinc-500">
            {selectedComponent
              ? `Click a component in the preview, then describe your edit below.`
              : 'Select a component or describe a site-wide edit below.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {editHistory.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-zinc-300">
                    {entry.instruction}
                  </p>
                  <button
                    className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                    title="Undo this edit"
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[9px] text-zinc-500">
                  <span>{entry.component ?? 'Site-wide'}</span>
                  <span>
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-700 p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedComponent
                ? `Edit ${selectedComponent.component}...`
                : 'Describe a site-wide edit...'
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-500 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
          />
          <button
            type="submit"
            disabled={!instruction.trim() || isStreaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white transition-colors hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600"
          >
            {isStreaming ? (
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
