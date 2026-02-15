import { useState } from 'react';
import {
  ChevronDown,
  Wrench,
  CheckCircle2,
  XCircle,
  ShieldOff,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface ToolDisplayProps {
  toolName: string;
  state: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
}

const STATE_CONFIG: Record<string, { label: string; color: string; Icon: typeof Wrench }> = {
  'input-streaming': { label: 'Running...', color: 'text-blue-400', Icon: Loader2 },
  'input-available': { label: 'Pending...', color: 'text-yellow-400', Icon: Clock },
  'output-available': { label: 'Done', color: 'text-green-400', Icon: CheckCircle2 },
  'output-error': { label: 'Error', color: 'text-red-400', Icon: XCircle },
  'output-denied': { label: 'Denied', color: 'text-orange-400', Icon: ShieldOff },
  'approval-responded': { label: 'Responded', color: 'text-muted-foreground', Icon: Clock },
};

const TOOL_LABELS: Record<string, string> = {
  readFile: 'Read File',
  listFiles: 'List Files',
  searchCode: 'Search Code',
  runCommand: 'Run Command',
  semanticSearch: 'Semantic Search',
};

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === null || output === undefined) return '';
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function formatInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
}

export function ToolDisplay({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolDisplayProps) {
  const [open, setOpen] = useState(false);
  const config = STATE_CONFIG[state] || STATE_CONFIG['input-available'];
  const { label, color, Icon } = config;
  const displayName = TOOL_LABELS[toolName] || toolName;
  const inputSummary = formatInput(input);
  const isActive = state === 'input-streaming';

  return (
    <div className="my-1.5 rounded-lg border border-border/50 bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground">{displayName}</span>
        {inputSummary && !open && (
          <span className="truncate text-muted-foreground/70 max-w-[200px]">
            {inputSummary}
          </span>
        )}
        <span className={cn('ml-auto flex items-center gap-1 shrink-0', color)}>
          <Icon className={cn('h-3 w-3', isActive && 'animate-spin')} />
          <span className="text-[10px] font-medium">{label}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/50 transition-transform shrink-0',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          {input != null && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Input
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap break-all text-muted-foreground font-mono text-[11px] leading-relaxed">
                {formatInput(input)}
              </pre>
            </div>
          )}
          {(output !== undefined || errorText) && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {errorText ? 'Error' : 'Output'}
              </span>
              <pre className={cn(
                'mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto',
                errorText ? 'text-red-400' : 'text-foreground/80'
              )}>
                {errorText || formatOutput(output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
