import { create } from 'zustand';
import { X, AlertCircle, ExternalLink } from 'lucide-react';
import type { ParsedStackTrace, StackFrame } from '@/lib/parsers/stack-trace-parser';
import { useSandboxStore } from '@/hooks/useSandbox';

/* ── Store ──────────────────────────────────── */

interface StackTraceState {
  trace: ParsedStackTrace | null;
  isOpen: boolean;
  showTrace: (trace: ParsedStackTrace) => void;
  dismiss: () => void;
}

export const useStackTrace = create<StackTraceState>((set) => ({
  trace: null,
  isOpen: false,
  showTrace: (trace) => set({ trace, isOpen: true }),
  dismiss: () => set({ isOpen: false }),
}));

/* ── Component ──────────────────────────────── */

export function StackTraceOverlay() {
  const { trace, isOpen, dismiss } = useStackTrace();

  if (!isOpen || !trace) return null;

  const userFrames = trace.frames.filter((f) => !f.isNodeModule);
  const libFrames = trace.frames.filter((f) => f.isNodeModule);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4"
      onClick={dismiss}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="glass-card relative w-full max-w-2xl p-4 sm:p-6 space-y-4 animate-scale-in max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <h2 className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-red-400">
              {trace.errorType}
            </h2>
          </div>
          <button
            onClick={dismiss}
            className="rounded p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error message */}
        <div className="flex-shrink-0 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-300 font-mono break-all">
            {trace.errorMessage}
          </p>
        </div>

        {/* Frames */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {/* User code frames */}
          {userFrames.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Your Code ({userFrames.length})
              </h3>
              {userFrames.map((frame, i) => (
                <FrameRow key={i} frame={frame} />
              ))}
            </div>
          )}

          {/* Library frames (dimmed) */}
          {libFrames.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                Libraries ({libFrames.length})
              </h3>
              {libFrames.map((frame, i) => (
                <FrameRow key={i} frame={frame} dimmed />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

function FrameRow({
  frame,
  dimmed = false,
}: {
  frame: StackFrame;
  dimmed?: boolean;
}) {
  const handleClick = () => {
    if (!frame.isNodeModule) {
      useSandboxStore.getState().openFile(frame.filePath);
    }
  };

  const fileName = frame.filePath.split('/').pop() || frame.filePath;

  return (
    <button
      onClick={handleClick}
      disabled={frame.isNodeModule}
      className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left transition-colors ${
        dimmed
          ? 'opacity-40 hover:opacity-60'
          : 'hover:bg-muted/30 cursor-pointer'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {frame.functionName && (
            <span
              className={`text-sm font-mono ${dimmed ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {frame.functionName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate">
          <span className="truncate">{fileName}</span>
          <span>:</span>
          <span className="text-primary">{frame.line}</span>
          {frame.column != null && (
            <>
              <span>:</span>
              <span>{frame.column}</span>
            </>
          )}
        </div>
      </div>
      {!frame.isNodeModule && (
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
