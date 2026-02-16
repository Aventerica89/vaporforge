import { useState, useEffect } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useMobileNav } from '@/hooks/useMobileNav';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MoreMenu } from './mobile/MoreMenu';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';

export function MobileLayout() {
  const { currentSession, isCreatingSession, selectSession, deselectSession } = useSandboxStore();
  useAutoReconnect();
  const { isVisible: keyboardOpen, viewportHeight } = useKeyboard();
  const { activeTab, setActiveTab, onSessionChange } = useMobileNav();
  const hasSession = !!currentSession;
  const swipeHandlers = useSwipeTabs({
    activeTab,
    onTabChange: setActiveTab,
    hasSession,
  });
  const [showCloneModal, setShowCloneModal] = useState(false);
  const containerHeight = `${viewportHeight}px`;

  const sessionId = currentSession?.id;
  useEffect(() => {
    onSessionChange();
  }, [sessionId, onSessionChange]);

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

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleTabChange = (tab: import('./mobile/MobileTabBar').MobileTab) => {
    if (tab === 'home' && hasSession) {
      deselectSession();
    }
    setActiveTab(tab);
  };

  const renderTabContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;

    if (!hasSession) {
      if (activeTab === 'more') {
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
          />
        );
      }
      return <WelcomeScreen />;
    }

    switch (activeTab) {
      case 'home':
        return <WelcomeScreen />;
      case 'chat':
        return <ChatPanel />;
      case 'files':
        return (
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        );
      case 'terminal':
        return <XTerminal compact />;
      case 'more':
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
          />
        );
      default:
        return <ChatPanel />;
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: containerHeight }}
    >
      {/* Top bar */}
      <div
        className={[
          'flex shrink-0 items-center justify-center border-b border-border',
          'bg-card/95 backdrop-blur-md px-4 safe-area-header',
        ].join(' ')}
        style={{ minHeight: '44px' }}
      >
        <div className="flex items-center gap-2">
          {currentSession ? (
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 512 512" className="shrink-0">
              <rect width="512" height="512" rx="96" fill="#0f1419" />
              <path d="M222 230 L162 296 L222 362" stroke="#1dd3e6" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M290 230 L350 296 L290 362" stroke="#E945F5" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          )}
          <span className="max-w-[200px] truncate text-sm font-semibold">
            {sessionName}
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div
        className="flex flex-1 flex-col min-h-0 overflow-hidden"
        {...swipeHandlers}
      >
        {renderTabContent()}
      </div>

      {/* Tab bar */}
      <MobileTabBar
        activeTab={hasSession ? activeTab : (activeTab === 'more' ? 'more' : 'home')}
        onTabChange={handleTabChange}
        hasSession={hasSession}
        keyboardOpen={keyboardOpen}
      />

      {/* Clone repo modal */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}
