import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Loader2, Check, X, File, Terminal, Pencil, Eye, Globe, Search } from 'lucide-react';
import type { MessagePart } from '@/lib/types';
import { GeminiIcon } from '@/components/icons/GeminiIcon';
import { SchemaViewer } from '@/components/elements/SchemaViewer';
import { CitationCard } from '@/components/ai-elements/CitationCard';

interface ToolCallBlockProps {
  part: MessagePart;
  isRunning?: boolean;
}

const GEMINI_LABELS: Record<string, string> = {
  gemini_quick_query: 'Gemini Query',
  gemini_analyze_code: 'Gemini Analyze',
  gemini_codebase_analysis: 'Gemini Codebase',
};

/** Map tool names to a display-friendly icon + label */
function getToolMeta(name: string) {
  const lower = name.toLowerCase();
  if (lower.startsWith('gemini_'))
    return { icon: null as null, label: GEMINI_LABELS[lower] || name, isGemini: true, isCitation: false };
  if (lower === 'bash' || lower === 'execute' || lower.includes('exec'))
    return { icon: Terminal, label: name, isGemini: false, isCitation: false };
  if (lower === 'read' || lower === 'glob')
    return { icon: Eye, label: name, isGemini: false, isCitation: false };
  if (lower === 'grep')
    return { icon: Search, label: name, isGemini: false, isCitation: false };
  if (lower === 'write' || lower === 'edit')
    return { icon: Pencil, label: name, isGemini: false, isCitation: false };
  if (lower === 'webfetch' || lower === 'web_fetch')
    return { icon: Globe, label: 'Web Fetch', isGemini: false, isCitation: true };
  if (lower === 'websearch' || lower === 'web_search')
    return { icon: Search, label: 'Web Search', isGemini: false, isCitation: false };
  return { icon: File, label: name, isGemini: false, isCitation: false };
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

  // Web fetch: show abbreviated URL
  if (lower === 'webfetch' || lower === 'web_fetch') {
    const url = input.url;
    if (typeof url === 'string') {
      try {
        const { hostname, pathname } = new URL(url);
        const path = pathname === '/' ? '' : (pathname.length > 40 ? `${pathname.slice(0, 37)}...` : pathname);
        return `${hostname}${path}`;
      } catch {
        return url.slice(0, 60);
      }
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
  const { icon: ToolIcon, label, isGemini, isCitation } = getToolMeta(toolName);
  const summary = getToolSummary(toolName, part.input);
  const inputUrl = typeof part.input?.url === 'string' ? part.input.url : null;
  const showCitation = isCitation && part.type === 'tool-result' && !!inputUrl;

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
        isGemini
          ? isRunning
            ? 'border-blue-500/40 shadow-[0_0_12px_-2px_rgba(66,133,244,0.25)]'
            : isError
              ? 'border-error/30'
              : 'border-blue-400/20'
          : isRunning
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
          <Loader2 className={`h-3.5 w-3.5 flex-shrink-0 animate-spin ${isGemini ? 'text-blue-400' : 'text-primary'}`} />
        ) : isError ? (
          <X className="h-3.5 w-3.5 flex-shrink-0 text-error" />
        ) : (
          <Check className={`h-3.5 w-3.5 flex-shrink-0 ${isGemini ? 'text-blue-400' : 'text-success'}`} />
        )}

        {/* Tool icon + name */}
        {isGemini ? (
          <GeminiIcon className="h-3.5 w-3.5 flex-shrink-0" />
        ) : ToolIcon ? (
          <ToolIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : null}
        <span className={`font-mono font-medium ${isGemini ? 'text-blue-300' : 'text-foreground'}`}>{label}</span>

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

      {/* Citation preview — always visible for completed WebFetch results */}
      {showCitation && (
        <div className="px-2 pb-2 pt-0">
          <CitationCard url={inputUrl!} content={part.output} />
        </div>
      )}

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
              <SchemaViewer data={part.input} className="mt-1" />
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
