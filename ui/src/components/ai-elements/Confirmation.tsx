import { cn } from '@/lib/cn';
import { AlertTriangle, Check, Globe, Pencil, ShieldAlert, Terminal, X } from 'lucide-react';
import React, { createContext, useCallback, useContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers (preserved from original)
// ---------------------------------------------------------------------------

const DESTRUCTIVE_PATTERN = /\brm\s+-[^ ]*r|\brmdir\b|\bdelete\b|\bdrop\b|\btruncate\b|\bwipe\b/i;

function isDestructiveOp(_toolName: string, input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  const cmd = typeof obj.command === 'string' ? obj.command : '';
  return DESTRUCTIVE_PATTERN.test(cmd);
}

function getToolIcon(toolName: string): React.ElementType {
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ConfirmationContextType = {
  toolName: string;
  input: unknown;
  isDestructive: boolean;
  summary: string;
  onApprove: () => void;
  onDeny: () => void;
};

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

function useConfirmationContext() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmationContext must be used within a Confirmation provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root — Confirmation
// ---------------------------------------------------------------------------

export type ConfirmationProps = {
  toolName: string;
  input: unknown;
  approvalId: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function Confirmation({
  toolName,
  input,
  approvalId,
  onApprove,
  onDeny,
  children,
  className,
  ...props
}: ConfirmationProps) {
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null);

  const isDestructive = isDestructiveOp(toolName, input);
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
      <ConfirmationContext.Provider
        value={{ toolName, input, isDestructive, summary, onApprove: handleApprove, onDeny: handleDeny }}
      >
        <ConfirmationResult responded={responded} className={className} {...props} />
      </ConfirmationContext.Provider>
    );
  }

  return (
    <ConfirmationContext.Provider
      value={{ toolName, input, isDestructive, summary, onApprove: handleApprove, onDeny: handleDeny }}
    >
      <div
        className={cn(
          'my-1.5 rounded-lg border px-3 py-2.5',
          isDestructive
            ? 'border-[color:var(--color-red-500)]/50 bg-[color:var(--color-red-500)]/5'
            : 'border-[color:var(--color-yellow-500)]/40 bg-[color:var(--color-yellow-500)]/5',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <ConfirmationHeader />
            <ConfirmationPreview />
            <ConfirmationActions />
          </>
        )}
      </div>
    </ConfirmationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationHeader
// ---------------------------------------------------------------------------

export type ConfirmationHeaderProps = {
  className?: string;
} & React.ComponentProps<'div'>;

export function ConfirmationHeader({ className, ...props }: ConfirmationHeaderProps) {
  const { toolName, isDestructive } = useConfirmationContext();
  const OpIcon = getToolIcon(toolName);

  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-2 text-xs font-medium',
        isDestructive
          ? 'text-[color:var(--color-red-400)]'
          : 'text-[color:var(--color-yellow-400)]',
        className,
      )}
      {...props}
    >
      {isDestructive ? (
        <AlertTriangle className="size-3.5 shrink-0" />
      ) : (
        <ShieldAlert className="size-3.5 shrink-0" />
      )}
      <span>{isDestructive ? 'Destructive action — approval required' : 'Approval required'}</span>
      <span
        className={cn(
          'ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]',
          isDestructive
            ? 'bg-[color:var(--color-red-500)]/15 text-[color:var(--color-red-400)]/80'
            : 'bg-[color:var(--color-yellow-500)]/15 text-[color:var(--color-yellow-400)]/80',
        )}
      >
        <OpIcon className="mr-1 inline-block size-2.5 -mt-px" />
        {toolName}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationPreview
// ---------------------------------------------------------------------------

export type ConfirmationPreviewProps = {
  className?: string;
} & React.ComponentProps<'code'>;

export function ConfirmationPreview({ className, ...props }: ConfirmationPreviewProps) {
  const { summary } = useConfirmationContext();

  return (
    <code
      className={cn(
        'mb-2.5 block rounded bg-black/30 px-2.5 py-1.5 font-mono text-[11px]',
        'text-[color:var(--foreground)]/90 break-all',
        className,
      )}
      {...props}
    >
      {summary}
    </code>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationActions
// ---------------------------------------------------------------------------

export type ConfirmationActionsProps = {
  className?: string;
} & React.ComponentProps<'div'>;

export function ConfirmationActions({ className, ...props }: ConfirmationActionsProps) {
  const { onApprove, onDeny } = useConfirmationContext();

  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <button
        type="button"
        onClick={onApprove}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium',
          'bg-[color:var(--color-green-600)]/20 text-[color:var(--color-green-400)]',
          'transition-opacity hover:opacity-80',
        )}
      >
        <Check className="size-3" />
        Approve
      </button>
      <button
        type="button"
        onClick={onDeny}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium',
          'bg-[color:var(--color-red-600)]/20 text-[color:var(--color-red-400)]',
          'transition-opacity hover:opacity-80',
        )}
      >
        <X className="size-3" />
        Deny
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationResult
// ---------------------------------------------------------------------------

export type ConfirmationResultProps = {
  responded: 'approved' | 'denied';
  className?: string;
} & React.ComponentProps<'div'>;

export function ConfirmationResult({ responded, className, ...props }: ConfirmationResultProps) {
  const { summary } = useConfirmationContext();
  const isApproved = responded === 'approved';

  return (
    <div
      className={cn(
        'my-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        isApproved
          ? 'border-[color:var(--color-green-500)]/30 bg-[color:var(--color-green-500)]/5 text-[color:var(--color-green-400)]'
          : 'border-[color:var(--color-red-500)]/30 bg-[color:var(--color-red-500)]/5 text-[color:var(--color-red-400)]',
        className,
      )}
      {...props}
    >
      {isApproved ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <X className="size-3.5 shrink-0" />
      )}
      <span className="font-medium">{isApproved ? 'Approved' : 'Denied'}:</span>
      <code className="max-w-[300px] truncate font-mono text-[11px]">{summary}</code>
    </div>
  );
}
