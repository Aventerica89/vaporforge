import { useState, useEffect, useCallback, useRef } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useMobileNav, getSubViewTitle } from '@/hooks/useMobileNav';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MobileNavBar } from './mobile/MobileNavBar';
import { MoreMenu } from './mobile/MoreMenu';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';
import { MarketplacePage } from './marketplace';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { usePlayground } from '@/hooks/usePlayground';

export function MobileLayout() {
  const { currentSession, isCreatingSession, selectSession, deselectSession } =
    useSandboxStore();
  useAutoReconnect();
  const { isVisible: keyboardOpen, viewportHeight } = useKeyboard();
  const {
    activeTab,
    setActiveTab,
    subView,
    setSubView,
    goBack,
    onSessionChange,
  } = useMobileNav();
  const hasSession = !!currentSession;
  const { contentRef, ...swipeHandlers } = useSwipeTabs({
    activeTab,
    onTabChange: setActiveTab,
    hasSession,
  });

  // H8 HIG fix: swipe from left edge to trigger goBack (mirrors iOS navigation pop gesture).
  const edgeSwipeStartX = useRef<number | null>(null);
  const onEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    edgeSwipeStartX.current = x < 20 ? x : null;
  }, []);
  const onEdgeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (edgeSwipeStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - edgeSwipeStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - (e.touches[0]?.clientY ?? 0));
    edgeSwipeStartX.current = null;
    if (deltaX > 50 && deltaY < 60) goBack();
  }, [goBack]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  // Use 100dvh when keyboard is closed (fills full dynamic viewport,
  // including area behind address bar chrome). Switch to exact pixel
  // height from visualViewport only when keyboard is open, since dvh
  // does NOT respond to the virtual keyboard (Apple HIG / WebKit spec).
  const containerHeight = keyboardOpen ? `${viewportHeight}px` : '100dvh';

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
    : null;

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleTabChange = (
    tab: import('./mobile/MobileTabBar').MobileTab,
  ) => {
    if (tab === 'home' && hasSession) {
      deselectSession();
    }
    setActiveTab(tab);
  };

  // Determine nav bar title
  const subViewTitle = getSubViewTitle(subView);
  const navTitle = subViewTitle ?? sessionName;
  const showBack = subView !== null;

  const renderTabContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;

    // Sub-views render within the More tab
    if (subView) {
      switch (subView) {
        case 'settings':
          return <SettingsPage inMobileSubView />;
        case 'marketplace':
          return <MarketplacePage />;
        case 'issues':
          // Open floating overlay and return to More
          useIssueTracker.getState().openTracker();
          goBack();
          return null;
        case 'playground':
          // Open floating overlay and return to More
          usePlayground.getState().openPlayground();
          goBack();
          return null;
        default:
          return null;
      }
    }

    if (!hasSession) {
      if (activeTab === 'more') {
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
            onNavigate={setSubView}
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
            onNavigate={setSubView}
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
      onTouchStart={onEdgeTouchStart}
      onTouchEnd={onEdgeTouchEnd}
    >
      {/* HIG Navigation Bar */}
      <MobileNavBar
        title={navTitle}
        showBack={showBack}
        onBack={goBack}
        statusDot={!showBack ? statusColor : null}
      />

      {/* Tab content — ref enables L2 live-swipe transform */}
      <div
        ref={subView ? undefined : contentRef}
        className="flex flex-1 flex-col min-h-0 overflow-hidden"
        {...(subView ? {} : swipeHandlers)}
      >
        {renderTabContent()}
      </div>

      {/* HIG Tab bar */}
      <MobileTabBar
        activeTab={
          hasSession
            ? activeTab
            : activeTab === 'more'
              ? 'more'
              : 'home'
        }
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
