import { cn } from '@/lib/cn';
import { ChevronRight } from 'lucide-react';
import React, { createContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, string> = {
  string: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  number: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  integer: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  boolean: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  object: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  array: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  null: 'bg-muted/40 text-muted-foreground border-border/30',
};

function guessType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SchemaDisplayContextType = {
  title?: string;
};

const SchemaDisplayContext = createContext<SchemaDisplayContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// SchemaDisplay — compound root with optional title
// ---------------------------------------------------------------------------

export type SchemaDisplayProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function SchemaDisplay({ title, children, className, ...props }: SchemaDisplayProps) {
  return (
    <SchemaDisplayContext.Provider value={{ title }}>
      <div
        className={cn(
          'overflow-auto rounded-md border border-border/20 bg-background/60 font-mono',
          className,
        )}
        {...props}
      >
        {title && (
          <div className="border-b border-border/20 px-2.5 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
          </div>
        )}
        <div className="p-2">{children}</div>
      </div>
    </SchemaDisplayContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// SchemaNode — recursive tree node
// ---------------------------------------------------------------------------

export type SchemaNodeProps = {
  name: string;
  value: unknown;
  depth?: number;
  required?: boolean;
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function SchemaNode({
  name,
  value,
  depth = 0,
  required = false,
  className,
  ...props
}: SchemaNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const type = guessType(value);
  const isExpandable = type === 'object' || type === 'array';
  const indent = depth * 12;

  const typeBadge = TYPE_BADGE[type] ?? TYPE_BADGE.null;

  const entries: [string, unknown][] =
    type === 'object' && value !== null
      ? Object.entries(value as Record<string, unknown>)
      : type === 'array' && Array.isArray(value)
        ? (value as unknown[]).map((v, i) => [String(i), v])
        : [];

  const displayValue =
    !isExpandable
      ? type === 'string'
        ? `"${String(value)}"`
        : String(value)
      : null;

  return (
    <div style={{ paddingLeft: indent }} className={cn(className)} {...props}>
      {/* Row */}
      <div
        className={cn(
          'flex min-h-[22px] items-start gap-1.5 rounded py-0.5',
          isExpandable && 'cursor-pointer hover:bg-muted/20',
        )}
        onClick={isExpandable ? () => setOpen((prev) => !prev) : undefined}
      >
        {/* Expand toggle */}
        <span className="mt-0.5 flex w-3 shrink-0 items-center justify-center">
          {isExpandable ? (
            <ChevronRight
              className={cn(
                'size-2.5 text-muted-foreground transition-transform duration-150',
                open && 'rotate-90',
              )}
            />
          ) : (
            <span className="inline-block size-1 rounded-full bg-border/60" />
          )}
        </span>

        {/* Key name */}
        <span className="shrink-0 text-[11px] text-foreground/80">
          {name}
          {required && <span className="ml-0.5 text-red-400">*</span>}
        </span>

        {/* Type badge */}
        <span
          className={cn(
            'rounded border px-1 py-0 text-[9px] uppercase tracking-wide',
            typeBadge,
          )}
        >
          {type}
          {type === 'array' && Array.isArray(value) && value.length > 0 && (
            <span className="ml-0.5 opacity-60">[{value.length}]</span>
          )}
        </span>

        {/* Scalar value */}
        {displayValue !== null && (
          <span className="truncate text-[10px] text-muted-foreground">
            {displayValue.length > 60 ? `${displayValue.slice(0, 57)}...` : displayValue}
          </span>
        )}
      </div>

      {/* Children — animate opacity + transform only (no layout props) */}
      {isExpandable && entries.length > 0 && (
        <div
          className={cn(
            'ml-3 border-l border-border/20 pl-1',
            'transition-[opacity,transform] duration-150',
            open
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-1 opacity-0',
          )}
          aria-hidden={!open}
        >
          {open &&
            entries.map(([k, v]) => (
              <SchemaNode key={k} name={k} value={v} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchemaViewer — standalone root container (no title, raw tree)
// ---------------------------------------------------------------------------

export type SchemaViewerProps = {
  data: Record<string, unknown> | unknown[];
  className?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>;

export function SchemaViewer({ data, className, ...props }: SchemaViewerProps) {
  const entries: [string, unknown][] = Array.isArray(data)
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data);

  return (
    <div
      className={cn('overflow-auto rounded-md bg-background/60 p-2 font-mono', className)}
      {...props}
    >
      {entries.map(([k, v]) => (
        <SchemaNode key={k} name={k} value={v} depth={0} />
      ))}
    </div>
  );
}
