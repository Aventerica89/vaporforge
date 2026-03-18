import { useEffect } from 'react';

/**
 * Detects PWA standalone vs Safari mode and manages CSS variables
 * for iOS tab bar safe area handling.
 *
 * Sets `data-standalone` on <html> when running as installed PWA.
 *
 * CSS variables managed:
 * - `--safari-toolbar-h`: 0–50px, tracks Safari's dynamic bottom toolbar
 */
export function useSafariToolbar(): void {
  useEffect(() => {
    const root = document.documentElement;

    // Detect standalone (PWA) mode — media query + iOS proprietary check
    const mqStandalone = window.matchMedia('(display-mode: standalone)');
    const isStandalone =
      mqStandalone.matches ||
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      root.setAttribute('data-standalone', '');
      root.style.setProperty('--safari-toolbar-h', '0px');

      // Listen for display-mode changes (unlikely but possible)
      const handleMqChange = (e: MediaQueryListEvent) => {
        if (!e.matches) {
          root.removeAttribute('data-standalone');
        }
      };
      mqStandalone.addEventListener('change', handleMqChange);

      return () => {
        mqStandalone.removeEventListener('change', handleMqChange);
        root.removeAttribute('data-standalone');
        root.style.removeProperty('--safari-toolbar-h');
      };
    }

    // Non-standalone: track Safari's dynamic bottom toolbar via visualViewport
    const isIOSSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && window.visualViewport != null;

    if (!isIOSSafari) {
      root.style.setProperty('--safari-toolbar-h', '0px');
      return () => {
        root.style.removeProperty('--safari-toolbar-h');
      };
    }

    const vv = window.visualViewport!;
    const computeToolbarHeight = () => {
      const toolbarH = Math.max(0, Math.round(window.innerHeight - vv.height));
      root.style.setProperty('--safari-toolbar-h', `${toolbarH}px`);
    };

    computeToolbarHeight();
    vv.addEventListener('resize', computeToolbarHeight);

    return () => {
      vv.removeEventListener('resize', computeToolbarHeight);
      root.style.removeProperty('--safari-toolbar-h');
    };
  }, []);
}
