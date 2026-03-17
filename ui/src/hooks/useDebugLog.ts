import { create } from 'zustand';

export type DebugCategory = 'api' | 'stream' | 'sandbox' | 'error' | 'info' | 'mcp' | 'auth' | 'system';

export interface DebugEntry {
  id: string;
  timestamp: string;
  category: DebugCategory;
  level: 'error' | 'warn' | 'info';
  summary: string;
  detail?: string;
}

interface DebugLogState {
  entries: DebugEntry[];
  unreadErrors: number;
  isOpen: boolean;

  // Filtering
  searchQuery: string;
  categoryFilter: Set<DebugCategory> | null;
  bookmarkedIds: Set<string>;

  addEntry: (
    entry: Omit<DebugEntry, 'id' | 'timestamp'>
  ) => void;
  clearEntries: () => void;
  markRead: () => void;
  toggle: () => void;
  close: () => void;

  // New actions
  setSearchQuery: (q: string) => void;
  setCategoryFilter: (cats: Set<DebugCategory> | null) => void;
  toggleBookmark: (id: string) => void;
  exportEntries: () => string;
}

const MAX_ENTRIES = 200;

export const useDebugLog = create<DebugLogState>((set, get) => ({
  entries: [],
  unreadErrors: 0,
  isOpen: false,
  searchQuery: '',
  categoryFilter: null,
  bookmarkedIds: new Set<string>(),

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

  setSearchQuery: (q) => set({ searchQuery: q }),

  setCategoryFilter: (cats) => set({ categoryFilter: cats }),

  toggleBookmark: (id) =>
    set((state) => {
      const next = new Set(state.bookmarkedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { bookmarkedIds: next };
    }),

  exportEntries: () => JSON.stringify(get().entries, null, 2),
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
