import { create } from 'zustand';

const STORAGE_KEY = 'vf-layout-custom-default';
const SYSTEM_DEFAULT = [15, 55, 30];

interface LayoutStore {
  currentSizes: number[];
  resetRequested: boolean;
  setCurrentSizes: (sizes: number[]) => void;
  saveAsDefault: () => void;
  resetToDefault: () => void;
  clearResetRequest: () => void;
  getSavedDefault: () => number[];
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  currentSizes: SYSTEM_DEFAULT,
  resetRequested: false,

  setCurrentSizes: (sizes) => set({ currentSizes: sizes }),

  saveAsDefault: () => {
    const { currentSizes } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSizes));
  },

  resetToDefault: () => {
    set({ resetRequested: true });
  },

  clearResetRequest: () => set({ resetRequested: false }),

  getSavedDefault: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return SYSTEM_DEFAULT;
  },
}));
