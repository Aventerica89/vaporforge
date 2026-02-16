import { useCallback, useRef, useState } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';

const TAB_ORDER: readonly MobileTab[] = ['home', 'chat', 'files', 'terminal', 'more'];

export type SwipeDirection = 'left' | 'right' | null;

export type SubView = null | 'settings' | 'marketplace' | 'issues' | 'playground';

const SUB_VIEW_TITLES: Record<Exclude<SubView, null>, string> = {
  settings: 'Settings',
  marketplace: 'Plugins',
  issues: 'Bug Tracker',
  playground: 'Dev Playground',
};

export function getSubViewTitle(subView: SubView): string | null {
  return subView ? SUB_VIEW_TITLES[subView] : null;
}

export function useMobileNav() {
  const [activeTab, setActiveTabState] = useState<MobileTab>('chat');
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [subView, setSubViewState] = useState<SubView>(null);
  const prevIndexRef = useRef(TAB_ORDER.indexOf('chat'));

  const setActiveTab = useCallback((tab: MobileTab) => {
    const newIndex = TAB_ORDER.indexOf(tab);
    const prevIndex = prevIndexRef.current;

    // Same tab selected — no-op
    if (newIndex === prevIndex) return;

    setSwipeDirection(newIndex > prevIndex ? 'left' : 'right');
    prevIndexRef.current = newIndex >= 0 ? newIndex : 0;
    setActiveTabState(tab);
    // Clear sub-view when switching tabs
    setSubViewState(null);
  }, []);

  const setSubView = useCallback((view: SubView) => {
    setSubViewState(view);
  }, []);

  const goBack = useCallback(() => {
    setSubViewState(null);
  }, []);

  const onSessionChange = useCallback(() => {
    setActiveTabState('chat');
    prevIndexRef.current = TAB_ORDER.indexOf('chat');
    setSwipeDirection(null);
    setSubViewState(null);
  }, []);

  return {
    activeTab,
    setActiveTab,
    swipeDirection,
    subView,
    setSubView,
    goBack,
    onSessionChange,
  };
}
