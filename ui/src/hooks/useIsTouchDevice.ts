import { useMemo } from 'react';

/**
 * Returns true when the primary pointer is coarse (touch).
 * Uses matchMedia which updates if a user connects/disconnects a mouse.
 */
export function useIsTouchDevice(): boolean {
  return useMemo(() => {
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);
}
