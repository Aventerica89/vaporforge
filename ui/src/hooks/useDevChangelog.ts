import { create } from 'zustand';

interface DevChangelogState {
  isOpen: boolean;
  openChangelog: () => void;
  closeChangelog: () => void;
}

export const useDevChangelog = create<DevChangelogState>((set) => ({
  isOpen: false,
  openChangelog: () => set({ isOpen: true }),
  closeChangelog: () => set({ isOpen: false }),
}));
