import { useState, useCallback } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ConfirmationProps {
  toolName: string;
  input: unknown;
  approvalId: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

function getCommandPreview(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return toolName;
  const obj = input as Record<string, unknown>;
  if (toolName === 'runCommand' && typeof obj.command === 'string') {
    return obj.command;
  }
  return Object.entries(obj)
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
  const preview = getCommandPreview(toolName, input);

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
          : 'border-red-500/30 bg-red-500/5 text-red-400'
      )}>
        {responded === 'approved' ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
        <span className="font-medium">
          {responded === 'approved' ? 'Approved' : 'Denied'}:
        </span>
        <code className="font-mono text-[11px] truncate max-w-[300px]">
          {preview}
        </code>
      </div>
    );
  }

  return (
    <div className="my-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-yellow-400 mb-2">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Approval required</span>
      </div>
      <div className="mb-2.5">
        <code className="block rounded bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-foreground/90 break-all">
          {preview}
        </code>
      </div>
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
          className="flex items-center gap-1.5 rounded-md bg-red-600/20 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-600/30 transition-colors"
        >
          <X className="h-3 w-3" />
          Deny
        </button>
      </div>
    </div>
  );
}
