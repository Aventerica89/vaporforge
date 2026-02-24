import type { LucideIcon } from 'lucide-react';
import {
  Terminal,
  Eye,
  Search,
  Pencil,
  Globe,
  File,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldOff,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Tool metadata — icons + display labels + classification
// ---------------------------------------------------------------------------

export type ToolMeta = {
  icon: LucideIcon | null;
  label: string;
  isGemini: boolean;
  isCitation: boolean;
};

const GEMINI_LABELS: Record<string, string> = {
  gemini_quick_query: 'Gemini Query',
  gemini_analyze_code: 'Gemini Analyze',
  gemini_codebase_analysis: 'Gemini Codebase',
};

export function getToolMeta(name: string): ToolMeta {
  const lower = name.toLowerCase();

  if (lower.startsWith('gemini_')) {
    return {
      icon: null,
      label: GEMINI_LABELS[lower] || name,
      isGemini: true,
      isCitation: false,
    };
  }
  if (lower === 'bash' || lower === 'execute' || lower.includes('exec')) {
    return { icon: Terminal, label: name, isGemini: false, isCitation: false };
  }
  if (lower === 'read' || lower === 'glob') {
    return { icon: Eye, label: name, isGemini: false, isCitation: false };
  }
  if (lower === 'grep') {
    return { icon: Search, label: name, isGemini: false, isCitation: false };
  }
  if (lower === 'write' || lower === 'edit') {
    return { icon: Pencil, label: name, isGemini: false, isCitation: false };
  }
  if (lower === 'webfetch' || lower === 'web_fetch') {
    return { icon: Globe, label: 'Web Fetch', isGemini: false, isCitation: true };
  }
  if (lower === 'websearch' || lower === 'web_search') {
    return { icon: Search, label: 'Web Search', isGemini: false, isCitation: false };
  }
  return { icon: File, label: name, isGemini: false, isCitation: false };
}

// ---------------------------------------------------------------------------
// Smart one-line summary from tool input
// ---------------------------------------------------------------------------

export function getToolSummary(
  name: string,
  input?: Record<string, unknown>,
): string | null {
  if (!input) return null;
  const lower = name.toLowerCase();

  // Bash/exec: show the command
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
        const path =
          pathname === '/'
            ? ''
            : pathname.length > 40
              ? `${pathname.slice(0, 37)}...`
              : pathname;
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

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// 6-state configuration (from ai-elements/Tool, expanded)
// ---------------------------------------------------------------------------

export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
  | 'approval-responded';

export type StateConfig = {
  label: string;
  color: string;
  Icon: LucideIcon;
};

export const STATE_CONFIG: Record<ToolState, StateConfig> = {
  'input-streaming': { label: 'Running...', color: 'text-blue-400', Icon: Loader2 },
  'input-available': { label: 'Pending...', color: 'text-yellow-400', Icon: Clock },
  'output-available': { label: 'Done', color: 'text-green-400', Icon: CheckCircle2 },
  'output-error': { label: 'Error', color: 'text-red-400', Icon: XCircle },
  'output-denied': { label: 'Denied', color: 'text-orange-400', Icon: ShieldOff },
  'approval-responded': { label: 'Responded', color: 'text-muted-foreground', Icon: Clock },
};
