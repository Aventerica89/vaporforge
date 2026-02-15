import { FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SourceFile {
  path: string;
  score: number;
}

interface SourcesProps {
  sources: SourceFile[];
  onSourceClick?: (path: string) => void;
  className?: string;
}

function truncatePath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-green-400';
  if (score >= 0.6) return 'text-yellow-400';
  return 'text-muted-foreground';
}

export function Sources({ sources, onSourceClick, className }: SourcesProps) {
  if (sources.length === 0) return null;

  return (
    <div className={cn('mt-2', className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1 block">
        Sources
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <button
            key={source.path}
            type="button"
            onClick={() => onSourceClick?.(source.path)}
            title={source.path}
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-[11px] hover:bg-muted/70 hover:border-primary/30 transition-colors cursor-pointer"
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-foreground/80 truncate max-w-[140px]">
              {truncatePath(source.path)}
            </span>
            <span className={cn('text-[9px] font-medium', scoreColor(source.score))}>
              {(source.score * 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
