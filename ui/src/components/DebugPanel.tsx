import { useEffect, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Bug, X } from 'lucide-react';
import { useDebugLog } from '@/hooks/useDebugLog';
import { ConsoleLogViewer } from '@/components/playground/ConsoleLogViewer';
import { WikiTab } from '@/components/WikiTab';
import { StreamDebugger } from '@/components/devtools/StreamDebugger';
import { TokenViewer } from '@/components/devtools/TokenViewer';
import { LatencyMeter } from '@/components/devtools/LatencyMeter';

type Tab = 'log' | 'wiki' | 'stream' | 'tokens' | 'latency';

const TAB_LABELS: Record<Tab, string> = {
  log: 'Log',
  wiki: 'Wiki',
  stream: 'Stream',
  tokens: 'Tokens',
  latency: 'Latency',
};

export function DebugPanel() {
  const { unreadErrors, isOpen, toggle, close } =
    useDebugLog();
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>('log');

  // H7 HIG fix: Focus trap keeps keyboard navigation inside the panel.
  const panelRef = useFocusTrap(isOpen, close) as React.RefObject<HTMLDivElement>;

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

      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 5rem, 5rem)',
            right: 'max(env(safe-area-inset-right, 0px) + 1rem, 1rem)',
            width: 'min(420px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 7rem)',
          }}
          role="dialog"
          aria-label="Debug panel"
        >
          {/* Header with tabs */}
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    tab === t
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {TAB_LABELS[t]}
                  {t === 'log' && unreadErrors > 0 && (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unreadErrors > 99 ? '99+' : unreadErrors}
                    </span>
                  )}
                </button>
              ))}
            </div>
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

          {/* Tab content */}
          {tab === 'log' && <ConsoleLogViewer compact />}
          {tab === 'wiki' && <WikiTab />}
          {tab === 'stream' && <StreamDebugger />}
          {tab === 'tokens' && <TokenViewer />}
          {tab === 'latency' && <LatencyMeter />}
        </div>
      )}
    </>
  );
}
