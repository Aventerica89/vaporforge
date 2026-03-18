import { useState, useEffect, useCallback, useRef } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useMobileNav, getSubViewTitle } from '@/hooks/useMobileNav';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { useSafariToolbar } from '@/hooks/useSafariToolbar';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MobileNavBar } from './mobile/MobileNavBar';
import { SafeAreaDebug } from './mobile/SafeAreaDebug';
import { MoreMenu } from './mobile/MoreMenu';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';


export function MobileLayout() {
  const { currentSession, isCreatingSession, selectSession, deselectSession } =
    useSandboxStore();
  useAutoReconnect();
  useSafariToolbar();
  const { isVisible: keyboardOpen } = useKeyboard();
  const {
    activeTab,
    setActiveTab,
    subView,
    setSubView,
    goBack,
    onSessionChange,
  } = useMobileNav();
  const isStandalone = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
     (window.navigator as { standalone?: boolean }).standalone === true);
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
        return (
          <ChatPanel
            compact

          />
        );
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
        return (
          <ChatPanel
            compact

          />
        );
    }
  };

  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
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
        style={{
          paddingBottom: keyboardOpen
            ? '0px'
            : isStandalone
              ? 'var(--tab-bar-h, 49px)'
              : 'calc(var(--tab-bar-h, 49px) + env(safe-area-inset-bottom, 0px))',
        }}
        {...(subView ? {} : swipeHandlers)}
      >
        {renderTabContent()}
      </div>

      {/* HIG Tab bar (fixed positioned) */}
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

      {/* Debug widget — temporary, remove after iOS tuning */}
      <SafeAreaDebug />

      {/* Clone repo modal */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}
