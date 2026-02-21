import { useRef, useCallback } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';
import { haptics } from '@/lib/haptics';

const SESSION_TAB_ORDER: MobileTab[] = ['chat', 'files', 'terminal', 'more'];
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
// L2 HIG fix: content follows finger during drag, springs back on release.
const TRANSITION = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

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
  // L2: ref to the content container — driven directly to avoid React re-renders per touch event
  const contentRef = useRef<HTMLDivElement>(null);

  const tabs = hasSession ? SESSION_TAB_ORDER : (['home', 'more'] as MobileTab[]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = null;
    // Remove transition so content moves instantly with finger
    if (contentRef.current) {
      contentRef.current.style.transition = 'none';
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (isHorizontalSwipe.current === null) {
      if (absDx > 10 || absDy > 10) {
        isHorizontalSwipe.current = absDx > absDy;
      }
    }

    // L2: move content with finger during confirmed horizontal swipe
    if (isHorizontalSwipe.current === true && contentRef.current) {
      contentRef.current.style.transform = `translateX(${dx}px)`;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    // L2: always spring content back to resting position
    if (contentRef.current) {
      contentRef.current.style.transition = TRANSITION;
      contentRef.current.style.transform = 'translateX(0)';
    }

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

  return { onTouchStart, onTouchMove, onTouchEnd, contentRef };
}
