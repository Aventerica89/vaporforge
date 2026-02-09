import { create } from 'zustand';

export type SettingsTab =
  | 'appearance'
  | 'shortcuts'
  | 'claude-md'
  | 'commands'
  | 'mcp'
  | 'plugins'
  | 'secrets'
  | 'account'
  | 'guide'
  | 'about';

interface SettingsState {
  isOpen: boolean;
  activeTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  activeTab: 'appearance',
  openSettings: (tab) =>
    set({ isOpen: true, activeTab: tab || 'appearance' }),
  closeSettings: () => set({ isOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
