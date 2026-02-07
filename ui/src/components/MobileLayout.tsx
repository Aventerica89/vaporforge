import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { MobileDrawer } from './MobileDrawer';
import { MobileBottomSheet } from './MobileBottomSheet';
import { CloneRepoModal } from './CloneRepoModal';
import { SettingsDialog } from './SettingsDialog';
import { WelcomeScreen } from './WelcomeScreen';

type SheetView = 'files' | 'terminal' | null;

export function MobileLayout() {
  const { currentSession } = useSandboxStore();
  const { isVisible: keyboardOpen, viewportHeight } = useKeyboard();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SheetView>(null);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Always use viewportHeight from visualViewport API — 100dvh does NOT
  // respond to iOS keyboard, and 100% requires unbroken height chain.
  // viewportHeight works in all states: initial, keyboard open/closed, chrome change.
  const containerHeight = `${viewportHeight}px`;

  // Close sheets/drawer when keyboard opens (avoid overlap)
  useEffect(() => {
    if (keyboardOpen) {
      setActiveSheet(null);
      setDrawerOpen(false);
    }
  }, [keyboardOpen]);

  const sessionName = currentSession
    ? (currentSession.metadata as { name?: string })?.name ||
      currentSession.id.slice(0, 8).toUpperCase()
    : 'VAPORFORGE';

  const statusColor = currentSession
    ? currentSession.status === 'active'
      ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
      : currentSession.status === 'sleeping'
        ? 'bg-yellow-500'
        : 'bg-gray-500'
    : '';

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: containerHeight }}
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 safe-top"
        style={{ minHeight: '48px' }}
      >
        {/* Left: hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Center: session name + status */}
        <div className="flex items-center gap-2">
          {currentSession && (
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          )}
          <span className="max-w-[180px] truncate text-sm font-semibold">
            {sessionName}
          </span>
        </div>

        {/* Right: avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          U
        </div>
      </div>

      {/* Main content area */}
      {currentSession ? (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <ChatPanel compact />
        </div>
      ) : (
        <WelcomeScreen />
      )}

      {/* Drawer */}
      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenFiles={() => setActiveSheet('files')}
        onOpenTerminal={() => setActiveSheet('terminal')}
        onOpenCloneModal={() => setShowCloneModal(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Files bottom sheet */}
      <MobileBottomSheet
        isOpen={activeSheet === 'files'}
        onClose={() => setActiveSheet(null)}
        title="Files"
      >
        <div className="h-[60vh]">
          <FileTree />
        </div>
      </MobileBottomSheet>

      {/* Terminal bottom sheet */}
      <MobileBottomSheet
        isOpen={activeSheet === 'terminal'}
        onClose={() => setActiveSheet(null)}
        title="Terminal"
      >
        <div className="h-[60vh]">
          <XTerminal compact />
        </div>
      </MobileBottomSheet>

      {/* Clone repo modal (triggered from drawer) */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />

      {/* Settings dialog (triggered from drawer) */}
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
