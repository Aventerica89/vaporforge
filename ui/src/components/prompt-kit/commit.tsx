import { cn } from '@/lib/cn';
import {
  Check,
  ChevronDown,
  Copy,
  FileEdit,
  FileInput,
  FileMinus,
  FilePlus,
  GitCommit,
} from 'lucide-react';
import React, { createContext, useContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type CommitContextType = {
  hash: string;
  message: string;
};

const CommitContext = createContext<CommitContextType | undefined>(undefined);

function useCommitContext() {
  const context = useContext(CommitContext);
  if (!context) {
    throw new Error('useCommitContext must be used within a Commit provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root — Commit
// ---------------------------------------------------------------------------

export type CommitProps = {
  hash: string;
  message: string;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function Commit({ hash, message, children, className, ...props }: CommitProps) {
  return (
    <CommitContext.Provider value={{ hash, message }}>
      <div
        className={cn(
          'rounded-lg border border-border/50 bg-muted/20 p-3 text-sm',
          className,
        )}
        {...props}
      >
        {/* Header row: icon + hash + message */}
        <div className="flex items-start gap-2">
          <GitCommit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {hash.slice(0, 7)}
              </span>
              <span className="truncate font-medium text-foreground">{message}</span>
            </div>
            {children && <div className="mt-2 space-y-1.5">{children}</div>}
          </div>
        </div>
      </div>
    </CommitContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CommitAuthorAvatar
// ---------------------------------------------------------------------------

export type CommitAuthorAvatarProps = {
  name: string;
  className?: string;
} & React.ComponentProps<'span'>;

export function CommitAuthorAvatar({ name, className, ...props }: CommitAuthorAvatarProps) {
  const initials = name
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
        'bg-muted font-mono text-[10px] font-semibold leading-none text-muted-foreground',
        className,
      )}
      title={name}
      aria-label={name}
      {...props}
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CommitTimestamp
// ---------------------------------------------------------------------------

export type CommitTimestampProps = {
  date: Date | string | number;
  className?: string;
} & React.ComponentProps<'time'>;

function relativeTime(date: Date | string | number): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(date).toLocaleDateString();
}

export function CommitTimestamp({ date, className, ...props }: CommitTimestampProps) {
  const iso = new Date(date).toISOString();
  return (
    <time
      dateTime={iso}
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    >
      {relativeTime(date)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// CommitCopyButton
// ---------------------------------------------------------------------------

export type CommitCopyButtonProps = {
  hash?: string;
  className?: string;
} & Omit<React.ComponentProps<'button'>, 'onClick'>;

export function CommitCopyButton({ hash: hashProp, className, ...props }: CommitCopyButtonProps) {
  const ctx = useCommitContext();
  const hash = hashProp ?? ctx.hash;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy commit hash'}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded transition-opacity',
        'text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'absolute transition-opacity duration-150',
          copied ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Check className="size-3.5 text-green-500" />
      </span>
      <span
        className={cn(
          'transition-opacity duration-150',
          copied ? 'opacity-0' : 'opacity-100',
        )}
      >
        <Copy className="size-3.5" />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CommitFileStatus
// ---------------------------------------------------------------------------

type FileStatusType = 'added' | 'modified' | 'deleted' | 'renamed';

const FILE_STATUS_CONFIG: Record<
  FileStatusType,
  { icon: React.ReactNode; label: string; className: string }
> = {
  added: {
    icon: <FilePlus className="size-3" />,
    label: 'A',
    className: 'bg-green-500/15 text-green-500 border-green-500/30',
  },
  modified: {
    icon: <FileEdit className="size-3" />,
    label: 'M',
    className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
  },
  deleted: {
    icon: <FileMinus className="size-3" />,
    label: 'D',
    className: 'bg-red-500/15 text-red-500 border-red-500/30',
  },
  renamed: {
    icon: <FileInput className="size-3" />,
    label: 'R',
    className: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  },
};

export type CommitFileStatusProps = {
  status: FileStatusType;
  className?: string;
} & React.ComponentProps<'span'>;

export function CommitFileStatus({ status, className, ...props }: CommitFileStatusProps) {
  const config = FILE_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono text-[10px] font-semibold leading-none',
        config.className,
        className,
      )}
      title={status}
      {...props}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CommitFileAdditions
// ---------------------------------------------------------------------------

export type CommitFileAdditionsProps = {
  count: number;
  className?: string;
} & React.ComponentProps<'span'>;

export function CommitFileAdditions({ count, className, ...props }: CommitFileAdditionsProps) {
  return (
    <span
      className={cn('font-mono text-xs font-medium text-green-500', className)}
      {...props}
    >
      +{count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CommitFileDeletions
// ---------------------------------------------------------------------------

export type CommitFileDeletionsProps = {
  count: number;
  className?: string;
} & React.ComponentProps<'span'>;

export function CommitFileDeletions({ count, className, ...props }: CommitFileDeletionsProps) {
  return (
    <span
      className={cn('font-mono text-xs font-medium text-red-500', className)}
      {...props}
    >
      -{count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CommitFiles — collapsible file list container
// ---------------------------------------------------------------------------

export type CommitFilesProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  label?: string;
  className?: string;
} & React.ComponentProps<'div'>;

export function CommitFiles({
  children,
  defaultOpen = false,
  label = 'Changed files',
  className,
  ...props
}: CommitFilesProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('mt-1.5', className)} {...props}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 text-xs text-muted-foreground',
          'transition-colors hover:text-foreground',
        )}
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-150',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
        <span>{label}</span>
      </button>

      {/* Animate height via max-height on opacity + transform only per prompt-kit rules */}
      <div
        className={cn(
          'overflow-hidden transition-[opacity,transform] duration-150',
          open ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-1',
        )}
        aria-hidden={!open}
      >
        <ul className="mt-1.5 space-y-0.5 pl-5">{children}</ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitFile — single file row (convenience sub-component)
// ---------------------------------------------------------------------------

export type CommitFileProps = {
  path: string;
  status: FileStatusType;
  additions?: number;
  deletions?: number;
  className?: string;
} & React.ComponentProps<'li'>;

export function CommitFile({
  path,
  status,
  additions,
  deletions,
  className,
  ...props
}: CommitFileProps) {
  const filename = path.split('/').pop() ?? path;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  return (
    <li
      className={cn('flex items-center gap-2 py-0.5', className)}
      {...props}
    >
      <CommitFileStatus status={status} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {dir && <span className="text-muted-foreground">{dir}</span>}
        <span className="text-foreground">{filename}</span>
      </span>
      {(additions !== undefined || deletions !== undefined) && (
        <span className="flex shrink-0 items-center gap-1">
          {additions !== undefined && <CommitFileAdditions count={additions} />}
          {deletions !== undefined && <CommitFileDeletions count={deletions} />}
        </span>
      )}
    </li>
  );
}
