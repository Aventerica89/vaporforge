import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Loader2, Check, X, File, Terminal, Pencil, Eye } from 'lucide-react';
import type { MessagePart } from '@/lib/types';

interface ToolCallBlockProps {
  part: MessagePart;
  isRunning?: boolean;
}

/** Map tool names to a display-friendly icon + label */
function getToolMeta(name: string) {
  const lower = name.toLowerCase();
  if (lower === 'bash' || lower === 'execute' || lower.includes('exec'))
    return { icon: Terminal, label: name };
  if (lower === 'read' || lower === 'glob' || lower === 'grep')
    return { icon: Eye, label: name };
  if (lower === 'write' || lower === 'edit')
    return { icon: Pencil, label: name };
  return { icon: File, label: name };
}

/** Extract a displayable file path or command from tool input */
function getToolSummary(name: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;
  const lower = name.toLowerCase();

  // Bash/exec tools: show the command
  if (lower === 'bash' || lower === 'execute' || lower.includes('exec')) {
    const cmd = input.command || input.cmd;
    if (typeof cmd === 'string') {
      return cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
    }
  }

  // File tools: show path
  const path = input.file_path || input.path || input.filePath;
  if (typeof path === 'string') return path;

  // Pattern-based tools
  const pattern = input.pattern || input.glob;
  if (typeof pattern === 'string') return pattern;

  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallBlock({ part, isRunning = false }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const isError = part.type === 'error';
  const toolName = part.name || 'Unknown tool';
  const { icon: ToolIcon, label } = getToolMeta(toolName);
  const summary = getToolSummary(toolName, part.input);

  // Live duration counter while running
  useEffect(() => {
    if (isRunning && part.startedAt) {
      setElapsed(Date.now() - part.startedAt);
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - (part.startedAt || Date.now()));
      }, 100);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, part.startedAt]);

  const displayDuration = isRunning
    ? elapsed
    : part.duration;

  return (
    <div
      className={`my-2 overflow-hidden rounded-lg border transition-all duration-200 ${
        isRunning
          ? 'border-primary/50 shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]'
          : isError
            ? 'border-error/30'
            : 'border-border/60'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />

        {/* Status icon */}
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
        ) : isError ? (
          <X className="h-3.5 w-3.5 flex-shrink-0 text-error" />
        ) : (
          <Check className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        )}

        {/* Tool icon + name */}
        <ToolIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium text-foreground">{label}</span>

        {/* Summary (file path or command) */}
        {summary && (
          <span className="truncate font-mono text-muted-foreground">
            {summary}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Duration */}
        {displayDuration != null && displayDuration > 0 && (
          <span className="flex-shrink-0 tabular-nums font-mono text-muted-foreground">
            {formatDuration(displayDuration)}
          </span>
        )}

        {isRunning && !displayDuration && (
          <span className="flex-shrink-0 text-muted-foreground">Running...</span>
        )}
      </button>

      {/* Expandable details with CSS transition */}
      <div
        ref={contentRef}
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded ? `${(contentRef.current?.scrollHeight || 500) + 16}px` : '0px',
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div className="border-t border-border/30 px-3 py-2 text-xs">
          {/* Input params */}
          {part.input && Object.keys(part.input).length > 0 && (
            <div className="mb-2">
              <span className="font-medium text-muted-foreground">Input</span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {part.output && (
            <div>
              <span className="font-medium text-muted-foreground">Output</span>
              <pre className="mt-1 max-h-48 overflow-y-auto overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                {part.output.length > 2000
                  ? `${part.output.slice(0, 2000)}...(truncated)`
                  : part.output}
              </pre>
            </div>
          )}

          {/* Error content */}
          {isError && part.content && (
            <div className="text-error">{part.content}</div>
          )}
        </div>
      </div>
    </div>
  );
}
