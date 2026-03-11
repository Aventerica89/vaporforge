/**
 * Vitest setup file — fixes Node.js 25+ native localStorage conflict with jsdom.
 *
 * Node.js 25 ships a native `localStorage` global that requires `--localstorage-file`
 * to work. Without it, `localStorage.getItem` etc. are NOT functions. This breaks
 * jsdom tests because the native stub shadows jsdom's proper implementation.
 *
 * Fix: Replace the global `localStorage` with a simple in-memory implementation
 * BEFORE jsdom initializes, so tests get a working Storage API.
 */

// Patch broken Node.js 25+ localStorage before anything else
if (
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.getItem !== 'function'
) {
  const store = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
}

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ensure RTL cleanup runs after each test (Vitest 4 + RTL 16 auto-cleanup race)
afterEach(() => {
  cleanup();
});
