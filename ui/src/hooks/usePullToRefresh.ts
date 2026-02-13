import { useRef, useState, useCallback } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disabled?: boolean;
}

interface PullToRefreshResult {
  pullDistance: number;
  isRefreshing: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: PullToRefreshOptions): PullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;
      const target = e.currentTarget as HTMLElement;
      // Only activate if scrolled to top
      if (target.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
    },
    [disabled, isRefreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null || disabled || isRefreshing) return;
      const deltaY = e.touches[0].clientY - startY.current;
      // Only track pull-down
      if (deltaY <= 0) {
        setPullDistance(0);
        return;
      }
      // Apply diminishing returns past threshold
      const distance =
        deltaY > threshold
          ? threshold + (deltaY - threshold) * 0.3
          : deltaY;
      setPullDistance(distance);
    },
    [disabled, isRefreshing, threshold]
  );

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  return {
    pullDistance,
    isRefreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
