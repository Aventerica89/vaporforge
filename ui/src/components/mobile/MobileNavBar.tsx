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
    <div
      className="shrink-0 safe-area-header"
      style={{
        background: 'rgba(30, 30, 30, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div
        className="flex items-center px-4"
        style={{ height: '44px' }}
      >
        {/* Left: back button or logo */}
        <div className="flex w-16 items-center">
          {showBack ? (
            <button
              onClick={() => {
                haptics.light();
                onBack?.();
              }}
              className="flex items-center gap-0.5 -ml-2 px-2 py-1"
              style={{
                color: '#1dd3e6',
                minHeight: '44px',
                minWidth: '44px',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Go back"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
              <span className="text-sm font-medium">Back</span>
            </button>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 512 512"
              className="shrink-0"
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
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          )}
          <span className="truncate font-semibold text-foreground" style={{ fontSize: '15px' }}>
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
