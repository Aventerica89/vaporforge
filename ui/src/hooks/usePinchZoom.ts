import { useRef, useState, useCallback, useEffect } from 'react';

interface PinchZoomOptions {
  /** Minimum font size */
  min: number;
  /** Maximum font size */
  max: number;
  /** Initial font size */
  initial: number;
  /** localStorage key for persistence */
  storageKey: string;
}

interface PinchZoomResult {
  fontSize: number;
  containerProps: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

function getStoredFontSize(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const num = parseFloat(stored);
      if (!isNaN(num)) return num;
    }
  } catch { /* privacy mode */ }
  return fallback;
}

export function usePinchZoom({
  min,
  max,
  initial,
  storageKey,
}: PinchZoomOptions): PinchZoomResult {
  const [fontSize, setFontSize] = useState(() =>
    getStoredFontSize(storageKey, initial)
  );

  // Track gesture with refs to avoid re-renders during pinch
  const initialDistance = useRef<number | null>(null);
  const fontSizeAtStart = useRef(fontSize);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(fontSize));
    } catch { /* quota */ }
  }, [fontSize, storageKey]);

  const getDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance.current = getDistance(e.touches);
        fontSizeAtStart.current = fontSize;
      }
    },
    [fontSize]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance.current === null) return;
      const currentDistance = getDistance(e.touches);
      const scale = currentDistance / initialDistance.current;
      const newSize = Math.round(
        Math.max(min, Math.min(max, fontSizeAtStart.current * scale))
      );
      setFontSize(newSize);
    },
    [min, max]
  );

  const onTouchEnd = useCallback(() => {
    initialDistance.current = null;
  }, []);

  return {
    fontSize,
    containerProps: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
