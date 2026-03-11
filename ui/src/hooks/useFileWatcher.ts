import { useEffect, useRef } from 'react';

export type FileWatchEvent = {
  type: 'event';
  eventType: 'create' | 'modify' | 'delete' | 'move_from' | 'move_to' | 'attrib';
  path: string;
  isDirectory: boolean;
  timestamp: string;
};

interface UseFileWatcherOptions {
  sessionId: string | null;
  onEvent: (event: FileWatchEvent) => void;
}

/**
 * Opens an SSE connection to /api/sdk/watch/:sessionId and calls onEvent
 * for each file change in /workspace. Automatically reconnects on error
 * (browser EventSource handles this natively).
 */
export function useFileWatcher({ sessionId, onEvent }: UseFileWatcherOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;

    const token = localStorage.getItem('session_token');
    if (!token) return;

    const es = new EventSource(
      `/api/sdk/watch/${sessionId}?token=${encodeURIComponent(token)}`
    );

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as { type: string } & Partial<FileWatchEvent>;
        if (event.type === 'event') {
          onEventRef.current(event as FileWatchEvent);
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => es.close();
  }, [sessionId]);
}
