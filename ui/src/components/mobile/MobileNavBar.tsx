import { memo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptics } from '@/lib/haptics';

interface MobileNavBarProps {
  /** Page title to display center */
  readonly title: string;
  /** Whether to show back button (sub-navigation active) */
  readonly showBack: boolean;
  /** Called when back button tapped */
  readonly onBack?: () => void;
  /** Status dot color class (e.g. 'bg-green-500') or null */
  readonly statusDot?: string | null;
  /** Right-side action node (optional) */
  readonly rightAction?: React.ReactNode;
}

export const MobileNavBar = memo(function MobileNavBar({
  title,
  showBack,
  onBack,
  statusDot,
  rightAction,
}: MobileNavBarProps) {
  return (
    <div className="shrink-0 safe-area-header glass-bar border-b border-border/50">
      <div className="flex h-11 items-center px-4">
        {/* Left: back button or logo */}
        <div className="flex w-16 items-center">
          {showBack ? (
            <button
              onClick={() => {
                haptics.light();
                onBack?.();
              }}
              className="flex min-h-11 min-w-11 items-center gap-0.5 -ml-2 px-2 py-1 text-primary transition-[transform,color] duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded"
              aria-label="Go back" title="Go back"
            >
              <ChevronLeft className="size-5" strokeWidth={2.5} />
              <span className="text-sm font-medium">Back</span>
            </button>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 512 512"
              className="shrink-0"
              aria-hidden="true"
            >
              <rect width="512" height="512" rx="96" fill="#0f1419" />
              <path
                d="M222 230 L162 296 L222 362"
                stroke="hsl(var(--primary))"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M290 230 L350 296 L290 362"
                stroke="#E945F5"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          )}
        </div>

        {/* Center: title */}
        <div className="flex flex-1 items-center justify-center gap-2">
          {statusDot && (
            <span className={`size-2 shrink-0 rounded-full ${statusDot}`} />
          )}
          <span className="truncate text-[15px] font-semibold text-foreground">
            {title}
          </span>
        </div>

        {/* Right: contextual action or spacer */}
        <div className="flex w-16 items-center justify-end">
          {rightAction ?? null}
        </div>
      </div>
    </div>
  );
});
