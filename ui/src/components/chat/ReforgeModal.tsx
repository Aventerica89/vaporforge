import { useState, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { X, Loader2, ChevronDown, ChevronRight, Flame, Wand2 } from 'lucide-react';
import { useReforge, type ReforgeChunk } from '@/hooks/useReforge';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useCodeTransform } from '@/hooks/useCodeTransform';

interface ReforgeModalProps {
  onInsert: (text: string) => void;
}

export function ReforgeModal({ onInsert }: ReforgeModalProps) {
  const {
    isOpen,
    close,
    selectedSessionId,
    setSelectedSession,
    chunks,
    isLoading,
    selectedChunkIds,
    toggleChunk,
    selectAll,
    deselectAll,
    buildContextText,
  } = useReforge();

  const sessions = useSandboxStore((s) => s.sessions);
  const currentSessionId = useSandboxStore((s) => s.currentSession?.id);

  // Auto-select current session when modal opens
  useEffect(() => {
    if (isOpen && !selectedSessionId && currentSessionId) {
      setSelectedSession(currentSessionId);
    }
  }, [isOpen, selectedSessionId, currentSessionId, setSelectedSession]);

  // H7 HIG fix: Focus trap keeps keyboard navigation inside the modal.
  const modalRef = useFocusTrap(isOpen, close) as React.RefObject<HTMLDivElement>;

  const selectedCount = selectedChunkIds.size;
  const allSelected = chunks.length > 0 && selectedCount === chunks.length;

  const sessionName =
    sessions.find((s) => s.id === selectedSessionId)?.metadata?.name as
      | string
      | undefined;

  const handleInsert = () => {
    const name = sessionName || selectedSessionId || 'Unknown';
    const text = buildContextText(name);
    if (text) {
      onInsert(text);
      close();
    }
  };

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSession(e.target.value);
  };

  const sortedSessions = [...sessions]
    .filter((s) => s.status === 'active' || s.status === 'sleeping')
    .sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4 safe-top safe-bottom"
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="glass-card relative w-full max-w-2xl p-4 sm:p-6 space-y-4 animate-scale-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-primary">
              Reforge
            </h2>
          </div>
          <button
            onClick={close}
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full hover:bg-accent hover:text-foreground transition-colors text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Session selector */}
        <div className="flex-shrink-0">
          <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
            Session
          </label>
          <select
            value={selectedSessionId || ''}
            onChange={handleSessionChange}
            className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          >
            <option value="" disabled>
              Select a session...
            </option>
            {sortedSessions.map((s) => {
              const name =
                (s.metadata?.name as string) || s.id.slice(0, 8);
              const date = new Date(s.lastActiveAt).toLocaleDateString();
              const isCurrent = s.id === currentSessionId;
              return (
                <option key={s.id} value={s.id}>
                  {name} — {date}
                  {isCurrent ? ' (current)' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Select all / deselect all */}
        {chunks.length > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {selectedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedCount} of {chunks.length} selected
              </span>
            )}
          </div>
        )}

        {/* Chunk list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <Flame className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {selectedSessionId
                  ? 'No conversation chunks found'
                  : 'Select a session to browse context'}
              </p>
            </div>
          ) : (
            chunks.map((chunk) => (
              <ChunkCard
                key={chunk.id}
                chunk={chunk}
                selected={selectedChunkIds.has(chunk.id)}
                onToggle={() => toggleChunk(chunk.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 pt-2 border-t border-border flex items-center gap-2">
          <button
            onClick={handleInsert}
            disabled={selectedCount === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Flame className="h-4 w-4" />
            Insert {selectedCount > 0 ? `${selectedCount} chunk${selectedCount > 1 ? 's' : ''}` : ''}
          </button>
          <button
            onClick={() => {
              const name = sessionName || selectedSessionId || 'Unknown';
              const text = buildContextText(name);
              if (text) {
                useCodeTransform.getState().openTransform(text, 'markdown');
                close();
              }
            }}
            disabled={selectedCount === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
          >
            <Wand2 className="h-4 w-4" />
            Transform
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Chunk Card ─────────────────────────────────── */

function ChunkCard({
  chunk,
  selected,
  onToggle,
}: {
  chunk: ReforgeChunk;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(chunk.timestamp);
  const timeStr = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`rounded-lg border p-3 transition-all cursor-pointer ${
        selected
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/40 bg-muted/30 hover:border-border/60'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="flex-shrink-0 pt-0.5">
          <div
            className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/40'
            }`}
          >
            {selected && (
              <svg
                className="h-3 w-3 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate">
              {chunk.heading}
            </p>
            <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 whitespace-nowrap">
              {dateStr} {timeStr}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {chunk.summary}
          </p>

          {/* File pills */}
          {chunk.files.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chunk.files.slice(0, 4).map((file) => {
                const name = file.split('/').pop() || file;
                return (
                  <span
                    key={file}
                    className="rounded bg-accent/50 px-1.5 py-px text-[10px] text-muted-foreground"
                  >
                    {name}
                  </span>
                );
              })}
              {chunk.files.length > 4 && (
                <span className="text-[10px] text-muted-foreground/50">
                  +{chunk.files.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Expand toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expanded ? 'Hide full context' : 'Show full context'}
          </button>

          {/* Expanded content */}
          {expanded && (
            <div
              className="mt-2 rounded-md bg-muted p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <span className="font-bold text-primary/80">User:</span>
                <pre className="mt-1 whitespace-pre-wrap text-foreground/80">
                  {chunk.userText}
                </pre>
              </div>
              <div className="border-t border-border/40 pt-2">
                <span className="font-bold text-primary/80">Claude:</span>
                <pre className="mt-1 whitespace-pre-wrap text-foreground/80">
                  {chunk.assistantText}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
