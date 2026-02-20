import { useState, useCallback } from 'react';
import { ShieldAlert, AlertTriangle, Check, X, Terminal, Pencil, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ConfirmationProps {
  toolName: string;
  input: unknown;
  approvalId: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

const DESTRUCTIVE_PATTERN = /\brm\s+-[^ ]*r|\brmdir\b|\bdelete\b|\bdrop\b|\btruncate\b|\bwipe\b/i;

function isDestructiveOp(_toolName: string, input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  const cmd = typeof obj.command === 'string' ? obj.command : '';
  return DESTRUCTIVE_PATTERN.test(cmd);
}

function getToolIcon(toolName: string) {
  const lower = toolName.toLowerCase();
  if (lower === 'bash' || lower.includes('exec') || lower === 'runcommand') return Terminal;
  if (lower === 'write' || lower === 'edit') return Pencil;
  if (lower === 'webfetch' || lower === 'web_fetch') return Globe;
  return ShieldAlert;
}

function getOperationSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return toolName;
  const obj = input as Record<string, unknown>;
  if (typeof obj.command === 'string') return obj.command;
  if (typeof obj.url === 'string') return obj.url;
  if (typeof obj.file_path === 'string') return obj.file_path;
  return Object.entries(obj)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
}

export function Confirmation({
  toolName,
  input,
  approvalId,
  onApprove,
  onDeny,
}: ConfirmationProps) {
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null);
  const isDestructive = isDestructiveOp(toolName, input);
  const OpIcon = getToolIcon(toolName);
  const summary = getOperationSummary(toolName, input);

  const handleApprove = useCallback(() => {
    setResponded('approved');
    onApprove(approvalId);
  }, [approvalId, onApprove]);

  const handleDeny = useCallback(() => {
    setResponded('denied');
    onDeny(approvalId);
  }, [approvalId, onDeny]);

  if (responded) {
    return (
      <div className={cn(
        'my-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        responded === 'approved'
          ? 'border-green-500/30 bg-green-500/5 text-green-400'
          : 'border-red-500/30 bg-red-500/5 text-red-400',
      )}>
        {responded === 'approved' ? (
          <Check className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <X className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span className="font-medium">{responded === 'approved' ? 'Approved' : 'Denied'}:</span>
        <code className="truncate max-w-[300px] font-mono text-[11px]">{summary}</code>
      </div>
    );
  }

  return (
    <div className={cn(
      'my-1.5 rounded-lg border px-3 py-2.5',
      isDestructive
        ? 'border-red-500/50 bg-red-500/5'
        : 'border-yellow-500/40 bg-yellow-500/5',
    )}>
      {/* Header */}
      <div className={cn(
        'mb-2 flex items-center gap-2 text-xs font-medium',
        isDestructive ? 'text-red-400' : 'text-yellow-400',
      )}>
        {isDestructive ? (
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span>{isDestructive ? 'Destructive action — approval required' : 'Approval required'}</span>
        <span className={cn(
          'ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]',
          isDestructive
            ? 'bg-red-500/15 text-red-400/80'
            : 'bg-yellow-500/15 text-yellow-400/80',
        )}>
          <OpIcon className="inline-block h-2.5 w-2.5 mr-1 -mt-px" />
          {toolName}
        </span>
      </div>

      {/* Command / operation preview */}
      <code className="mb-2.5 block rounded bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-foreground/90 break-all">
        {summary}
      </code>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApprove}
          className="flex items-center gap-1.5 rounded-md bg-green-600/20 px-3 py-1.5 text-[11px] font-medium text-green-400 hover:bg-green-600/30 transition-colors"
        >
          <Check className="h-3 w-3" />
          Approve
        </button>
        <button
          type="button"
          onClick={handleDeny}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
            isDestructive
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-red-600/20 text-red-400 hover:bg-red-600/30',
          )}
        >
          <X className="h-3 w-3" />
          Deny
        </button>
      </div>
    </div>
  );
}
