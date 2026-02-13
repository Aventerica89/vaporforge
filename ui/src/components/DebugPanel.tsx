import { useEffect, useState } from 'react';
import { Bug, X } from 'lucide-react';
import { useDebugLog } from '@/hooks/useDebugLog';
import { ConsoleLogViewer } from '@/components/playground/ConsoleLogViewer';

export function DebugPanel() {
  const { unreadErrors, isOpen, toggle, close } =
    useDebugLog();
  const [visible, setVisible] = useState(false);

  // Check localStorage flag on mount + listen for storage events
  useEffect(() => {
    const check = () =>
      setVisible(localStorage.getItem('vf_debug') === '1');
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Floating debug button */}
      <button
        onClick={toggle}
        className="fixed z-50 flex items-center justify-center rounded-full bg-card border border-border shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 1rem)',
          right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
          minWidth: 'var(--touch-target)',
          minHeight: 'var(--touch-target)',
          width: 'var(--touch-target)',
          height: 'var(--touch-target)',
        }}
        aria-label="Toggle debug panel"
      >
        <Bug className="h-5 w-5 text-muted-foreground" />
        {unreadErrors > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadErrors > 99 ? '99+' : unreadErrors}
          </span>
        )}
      </button>

      {/* Panel — now uses shared ConsoleLogViewer */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 5rem, 5rem)',
            right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
            width: 'min(420px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 7rem)',
          }}
          role="dialog"
          aria-label="Debug log panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Debug Log
            </span>
            <button
              onClick={close}
              className="flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
              style={{
                minWidth: 'var(--touch-target)',
                minHeight: 'var(--touch-target)',
              }}
              aria-label="Close debug panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Shared log viewer — compact mode */}
          <ConsoleLogViewer compact />
        </div>
      )}
    </>
  );
}
