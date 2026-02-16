import { useCallback, useRef, useState } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';

const TAB_ORDER: MobileTab[] = ['chat', 'files', 'terminal', 'more'];

export type SwipeDirection = 'left' | 'right' | null;

export function useMobileNav() {
  const [activeTab, setActiveTabState] = useState<MobileTab>('chat');
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const prevIndexRef = useRef(0);

  const setActiveTab = useCallback((tab: MobileTab) => {
    const newIndex = TAB_ORDER.indexOf(tab);
    const prevIndex = prevIndexRef.current;
    setSwipeDirection(newIndex > prevIndex ? 'left' : 'right');
    prevIndexRef.current = newIndex >= 0 ? newIndex : 0;
    setActiveTabState(tab);
  }, []);

  const onSessionChange = useCallback(() => {
    setActiveTabState('chat');
    prevIndexRef.current = 0;
    setSwipeDirection(null);
  }, []);

  return { activeTab, setActiveTab, swipeDirection, onSessionChange };
}
