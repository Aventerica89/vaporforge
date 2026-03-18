import { useSyncExternalStore, useCallback } from 'react';

const KEY = 'vf_smooth_streaming';

/** Subscribers notified when the preference changes */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  return localStorage.getItem(KEY) === '1';
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * localStorage-backed preference for smooth text animation.
 *
 * Default: false (raw Streamdown — tokens render as they arrive).
 * When true: useSmoothText rAF animation is enabled.
 */
export function useSmoothStreaming(): [boolean, (v: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setEnabled = useCallback((v: boolean) => {
    localStorage.setItem(KEY, v ? '1' : '0');
    for (const cb of listeners) cb();
  }, []);

  return [enabled, setEnabled];
}
