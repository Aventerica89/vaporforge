import { useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ── Suggestions container ────────────────── */

interface SuggestionsProps {
  className?: string;
  children: ReactNode;
}

export function Suggestions({ className, children }: SuggestionsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

/* ── Single suggestion chip ───────────────── */

interface SuggestionProps {
  suggestion: string;
  icon?: ReactNode;
  onClick?: (suggestion: string) => void;
  className?: string;
  children?: ReactNode;
}

export function Suggestion({
  suggestion,
  icon,
  onClick,
  className,
  children,
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        // M1/M2 HIG fix: 44px min touch target (HIG 44pt minimum interactive area)
        'flex items-center gap-2 rounded-full border border-border/60',
        'bg-muted/30 px-4 py-2 text-xs text-muted-foreground',
        'hover:border-primary/40 hover:text-foreground hover:bg-primary/5',
        'hover:scale-[1.02] active:scale-[0.98]',
        'transition-all cursor-pointer min-h-[44px]',
        className,
      )}
    >
      {icon}
      {children || suggestion}
    </button>
  );
}
