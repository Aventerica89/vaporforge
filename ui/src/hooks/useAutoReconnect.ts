import { useEffect, useRef } from 'react';
import { useSandboxStore } from './useSandbox';
import { sessionsApi } from '@/lib/api';

/**
 * Detects when the app returns from background/sleep and:
 * 1. Resets stuck streaming state (connection died while phone slept)
 * 2. Wakes the sandbox if it fell asleep (10min timeout)
 * 3. Refreshes files and git status
 */
export function useAutoReconnect() {
  const currentSession = useSandboxStore((s) => s.currentSession);
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const loadFiles = useSandboxStore((s) => s.loadFiles);
  const loadGitStatus = useSandboxStore((s) => s.loadGitStatus);
  const lastVisibleRef = useRef(Date.now());

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastVisibleRef.current = Date.now();
        return;
      }

      // Now visible again
      if (!currentSession) return;

      const hiddenDuration = Date.now() - lastVisibleRef.current;

      // Only act if hidden for more than 30 seconds
      if (hiddenDuration < 30_000) return;

      // If we were streaming, the SSE connection is probably dead
      if (isStreaming) {
        useSandboxStore.setState({
          isStreaming: false,
          streamingContent: '',
          streamingParts: [],
        });
      }

      // Wake the sandbox (fire-and-forget)
      sessionsApi.resume(currentSession.id).catch(() => {});

      // Refresh state
      loadFiles();
      loadGitStatus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentSession, isStreaming, loadFiles, loadGitStatus]);
}
