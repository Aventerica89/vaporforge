import { useMemo } from 'react';

type LayoutTier = 'phone' | 'tablet' | 'desktop';

interface DeviceInfo {
  isIos: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isIpad: boolean;
  isPwa: boolean;
  isTouch: boolean;
  layoutTier: LayoutTier;
}

/**
 * Platform detection hook. Uses navigator.userAgent for OS detection,
 * matchMedia for pointer type, and display-mode for PWA/standalone.
 *
 * Layout tiers:
 * - phone:   width < 768px
 * - tablet:  iPad (any width) OR 768-1023px touch device
 * - desktop: >= 1024px non-iPad
 */
export function useDeviceInfo(): DeviceInfo {
  return useMemo(() => {
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    const isAndroid = /Android/.test(ua);
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const isPwa = window.matchMedia('(display-mode: standalone)').matches;

    // iPadOS 13+ reports as "Macintosh" in UA — detect via touch + platform
    const isIpad =
      isIos ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (/Macintosh/.test(ua) && isTouch);

    const width = window.innerWidth;
    const isMobile = width < 768;

    let layoutTier: LayoutTier;
    if (width < 768) {
      layoutTier = 'phone';
    } else if (isIpad || (width < 1024 && isTouch)) {
      layoutTier = 'tablet';
    } else {
      layoutTier = 'desktop';
    }

    return { isIos, isAndroid, isMobile, isIpad, isPwa, isTouch, layoutTier };
  }, []);
}
