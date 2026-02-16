import { useRef, useCallback } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';
import { haptics } from '@/lib/haptics';

const SESSION_TAB_ORDER: MobileTab[] = ['chat', 'files', 'terminal', 'more'];
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

interface UseSwipeTabsOptions {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasSession: boolean;
}

export function useSwipeTabs({ activeTab, onTabChange, hasSession }: UseSwipeTabsOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const tabs = hasSession ? SESSION_TAB_ORDER : (['home', 'more'] as MobileTab[]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = null;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isHorizontalSwipe.current === null) {
      const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
      const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
      if (dx > 10 || dy > 10) {
        isHorizontalSwipe.current = dx > dy;
      }
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isHorizontalSwipe.current !== true) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = Math.abs(deltaX) / elapsed;

    const isSwipe = Math.abs(deltaX) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;
    if (!isSwipe) return;

    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < 0) return;

    if (deltaX < 0 && currentIndex < tabs.length - 1) {
      haptics.light();
      onTabChange(tabs[currentIndex + 1]);
    } else if (deltaX > 0 && currentIndex > 0) {
      haptics.light();
      onTabChange(tabs[currentIndex - 1]);
    }
  }, [activeTab, onTabChange, tabs]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
