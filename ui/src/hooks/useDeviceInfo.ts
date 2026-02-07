import { useMemo } from 'react';

interface DeviceInfo {
  isIos: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isPwa: boolean;
}

/**
 * Platform detection hook. Uses navigator.userAgent for OS detection
 * and display-mode media query for PWA/standalone detection.
 *
 * Memoized so it only computes once per component lifecycle.
 */
export function useDeviceInfo(): DeviceInfo {
  return useMemo(() => {
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    const isAndroid = /Android/.test(ua);
    const isMobile = isIos || isAndroid || window.innerWidth < 768;
    const isPwa = window.matchMedia('(display-mode: standalone)').matches;

    return { isIos, isAndroid, isMobile, isPwa };
  }, []);
}
