import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

// Simple JSON type badges
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

interface SchemaNodeProps {
  name: string;
  value: unknown;
  depth?: number;
  required?: boolean;
}

function SchemaNode({ name, value, depth = 0, required = false }: SchemaNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const type = guessType(value);
  const isExpandable = type === 'object' || type === 'array';
  const indent = depth * 12;

  const typeBadge = TYPE_BADGE[type] ?? TYPE_BADGE.null;

  const entries =
    type === 'object' && value !== null
      ? Object.entries(value as Record<string, unknown>)
      : type === 'array' && Array.isArray(value)
        ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
        : [];

  const displayValue =
    !isExpandable
      ? type === 'string'
        ? `"${String(value)}"`
        : String(value)
      : null;

  return (
    <div style={{ paddingLeft: indent }}>
      <div
        className={`flex min-h-[22px] items-start gap-1.5 rounded py-0.5 ${isExpandable ? 'cursor-pointer hover:bg-muted/20' : ''}`}
        onClick={isExpandable ? () => setOpen((p) => !p) : undefined}
      >
        {/* Expand toggle */}
        <span className="mt-0.5 flex w-3 flex-shrink-0 items-center justify-center">
          {isExpandable ? (
            <ChevronRight
              className={`h-2.5 w-2.5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="h-1 w-1 rounded-full bg-border/60" />
          )}
        </span>

        {/* Key name */}
        <span className="flex-shrink-0 font-mono text-[11px] text-foreground/80">
          {name}
          {required && <span className="ml-0.5 text-red-400">*</span>}
        </span>

        {/* Type badge */}
        <span className={`rounded border px-1 py-0 font-mono text-[9px] uppercase tracking-wide ${typeBadge}`}>
          {type}
          {type === 'array' && Array.isArray(value) && value.length > 0 && (
            <span className="ml-0.5 opacity-60">[{value.length}]</span>
          )}
        </span>

        {/* Scalar value */}
        {displayValue !== null && (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {displayValue.length > 60 ? `${displayValue.slice(0, 57)}...` : displayValue}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpandable && open && entries.length > 0 && (
        <div className="ml-3 border-l border-border/20 pl-1">
          {entries.map(([k, v]) => (
            <SchemaNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SchemaViewerProps {
  data: Record<string, unknown> | unknown[];
  className?: string;
}

export function SchemaViewer({ data, className = '' }: SchemaViewerProps) {
  const entries = Array.isArray(data)
    ? (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(data);

  return (
    <div className={`overflow-auto rounded-md bg-background/60 p-2 font-mono ${className}`}>
      {entries.map(([k, v]) => (
        <SchemaNode key={k} name={k} value={v} depth={0} />
      ))}
    </div>
  );
}
