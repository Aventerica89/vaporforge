import { create } from 'zustand';

export interface DebugEntry {
  id: string;
  timestamp: string;
  category: 'api' | 'stream' | 'sandbox' | 'error' | 'info';
  level: 'error' | 'warn' | 'info';
  summary: string;
  detail?: string;
}

interface DebugLogState {
  entries: DebugEntry[];
  unreadErrors: number;
  isOpen: boolean;

  addEntry: (
    entry: Omit<DebugEntry, 'id' | 'timestamp'>
  ) => void;
  clearEntries: () => void;
  markRead: () => void;
  toggle: () => void;
  close: () => void;
}

const MAX_ENTRIES = 200;

export const useDebugLog = create<DebugLogState>((set) => ({
  entries: [],
  unreadErrors: 0,
  isOpen: false,

  addEntry: (partial) => {
    const entry: DebugEntry = {
      ...partial,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    set((state) => {
      const entries = [...state.entries, entry].slice(-MAX_ENTRIES);
      const unreadErrors =
        entry.level === 'error' && !state.isOpen
          ? state.unreadErrors + 1
          : state.unreadErrors;
      return { entries, unreadErrors };
    });
  },

  clearEntries: () => set({ entries: [], unreadErrors: 0 }),

  markRead: () => set({ unreadErrors: 0 }),

  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      unreadErrors: !state.isOpen ? 0 : state.unreadErrors,
    })),

  close: () => set({ isOpen: false }),
}));

// Capture unhandled errors globally
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    useDebugLog.getState().addEntry({
      category: 'error',
      level: 'error',
      summary: event.message || 'Uncaught error',
      detail: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    useDebugLog.getState().addEntry({
      category: 'error',
      level: 'error',
      summary: `Unhandled rejection: ${reason}`,
    });
  });
}
