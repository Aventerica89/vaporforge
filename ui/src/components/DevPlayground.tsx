import { useEffect } from 'react';
import { X, Paintbrush, Code2, Terminal, Bug } from 'lucide-react';
import { usePlayground } from '@/hooks/usePlayground';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { CanvasTab } from '@/components/playground/CanvasTab';
import { ComponentsTab } from '@/components/playground/ComponentsTab';
import { ConsoleTab } from '@/components/playground/ConsoleTab';
import { IssuesTab } from '@/components/playground/IssuesTab';
import type { PlaygroundTab } from '@/hooks/usePlayground';

const TABS: { id: PlaygroundTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'canvas', label: 'Canvas', shortLabel: 'Canvas', icon: <Paintbrush className="h-4 w-4" /> },
  { id: 'components', label: 'Components', shortLabel: 'Comps', icon: <Code2 className="h-4 w-4" /> },
  { id: 'console', label: 'Console', shortLabel: 'Console', icon: <Terminal className="h-4 w-4" /> },
  { id: 'issues', label: 'Issues', shortLabel: 'Issues', icon: <Bug className="h-4 w-4" /> },
];

const TAB_CONTENT: Record<PlaygroundTab, () => JSX.Element> = {
  canvas: CanvasTab,
  components: ComponentsTab,
  console: ConsoleTab,
  issues: IssuesTab,
};

export function DevPlayground() {
  const { isOpen, activeTab, setActiveTab, closePlayground } = usePlayground();
  const { layoutTier } = useDeviceInfo();
  const isMobile = layoutTier === 'phone';

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayground();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePlayground]);

  if (!isOpen) return null;

  const TabContent = TAB_CONTENT[activeTab];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden"
    >
      {/* ─── Header ─── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card px-3 py-2.5 safe-area-header sm:px-4 sm:py-3">
        <h1
          className="font-display text-sm font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 sm:text-base"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Dev Playground
        </h1>

        {/* Desktop: tab bar + close in header */}
        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-muted-foreground hover:text-amber-400 hover:bg-amber-500/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={closePlayground}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-8"
            aria-label="Close Playground"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>

      {/* ─── Mobile / Tablet: horizontal scrollable tab bar ─── */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border/60 px-2 scrollbar-none md:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            style={{ minHeight: 'var(--touch-target, 44px)' }}
          >
            {tab.icon}
            {isMobile ? tab.shortLabel : tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab content ─── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TabContent />
      </div>
    </div>
  );
}
