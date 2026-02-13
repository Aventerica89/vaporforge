import { useState, useEffect, useRef } from 'react';

interface KeyboardState {
  /** Whether the virtual keyboard is currently visible */
  isVisible: boolean;
  /** Estimated keyboard height in pixels */
  height: number;
  /** Current visual viewport height (tracks keyboard animation) */
  viewportHeight: number;
}

/**
 * Tracks virtual keyboard state via the visualViewport API.
 * On iOS PWA, window.innerHeight stays fixed while visualViewport.height
 * shrinks when the keyboard opens — the diff gives us keyboard height.
 *
 * Threshold of 150px distinguishes keyboard from browser chrome changes.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isVisible: false,
    height: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let fullHeight = window.innerHeight;

    const update = () => {
      const vpHeight = vv.height;
      const kbHeight = fullHeight - vpHeight;
      const isVisible = kbHeight > 150;

      // Only scroll on keyboard close to prevent bounce when typing
      if (wasVisibleRef.current && !isVisible) {
        window.scrollTo(0, 0);
      }

      wasVisibleRef.current = isVisible;

      setState({
        isVisible,
        height: isVisible ? kbHeight : 0,
        viewportHeight: vpHeight,
      });
    };

    // Recalibrate baseline on orientation change
    const handleOrientationChange = () => {
      setTimeout(() => {
        fullHeight = window.innerHeight;
        update();
      }, 300);
    };

    update();
    vv.addEventListener('resize', update);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      vv.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return state;
}
