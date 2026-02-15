import { cn } from '@/lib/cn';

interface ShimmerProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Text shimmer effect — a gradient sweep that animates across text.
 * CSS-only adaptation of AI Elements Shimmer (no framer-motion).
 */
export function Shimmer({ className, children }: ShimmerProps) {
  return (
    <span
      className={cn(
        'inline-block bg-clip-text text-transparent shimmer-text',
        className,
      )}
    >
      {children}
    </span>
  );
}
