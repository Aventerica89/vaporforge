import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PlaygroundTab = 'canvas' | 'components' | 'console' | 'issues';

export interface PlaygroundPanel {
  id: string;
  name: string;
  code: string;
  props: Record<string, unknown>;
  tailwindClasses: string;
  createdAt: string;
  updatedAt: string;
}

interface PlaygroundState {
  panels: PlaygroundPanel[];
  activePanel: string | null;
  activeTab: PlaygroundTab;
  viewport: 'mobile' | 'tablet' | 'desktop';
  isOpen: boolean;

  openPlayground: (tab?: PlaygroundTab) => void;
  closePlayground: () => void;
  setActiveTab: (tab: PlaygroundTab) => void;
  setViewport: (viewport: 'mobile' | 'tablet' | 'desktop') => void;

  addPanel: (name: string, code?: string) => void;
  updatePanel: (id: string, updates: Partial<Pick<PlaygroundPanel, 'name' | 'code' | 'props' | 'tailwindClasses'>>) => void;
  removePanel: (id: string) => void;
  setActivePanel: (id: string | null) => void;
  insertCode: (code: string) => void;
}

export const usePlayground = create<PlaygroundState>()(
  persist(
    (set, get) => ({
      panels: [],
      activePanel: null,
      activeTab: 'canvas',
      viewport: 'desktop',
      isOpen: false,

      openPlayground: (tab) =>
        set({ isOpen: true, ...(tab ? { activeTab: tab } : {}) }),
      closePlayground: () => set({ isOpen: false }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setViewport: (viewport) => set({ viewport }),

      addPanel: (name, code = '') => {
        const now = new Date().toISOString();
        const panel: PlaygroundPanel = {
          id: crypto.randomUUID(),
          name,
          code: code || `// ${name}\nexport default function ${name.replace(/\s+/g, '')}() {\n  return (\n    <div className="p-4">\n      <h2>${name}</h2>\n    </div>\n  );\n}`,
          props: {},
          tailwindClasses: '',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          panels: [...state.panels, panel],
          activePanel: panel.id,
        }));
      },

      updatePanel: (id, updates) => {
        set((state) => ({
          panels: state.panels.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      removePanel: (id) => {
        set((state) => {
          const next = state.panels.filter((p) => p.id !== id);
          return {
            panels: next,
            activePanel:
              state.activePanel === id
                ? next[0]?.id || null
                : state.activePanel,
          };
        });
      },

      setActivePanel: (id) => set({ activePanel: id }),

      // Insert code into the active panel (used by component catalog)
      insertCode: (code) => {
        const { activePanel, panels } = get();
        if (!activePanel) {
          // No panel — create one with the code
          const now = new Date().toISOString();
          const panel: PlaygroundPanel = {
            id: crypto.randomUUID(),
            name: 'Untitled',
            code,
            props: {},
            tailwindClasses: '',
            createdAt: now,
            updatedAt: now,
          };
          set({
            panels: [...panels, panel],
            activePanel: panel.id,
            activeTab: 'canvas',
          });
        } else {
          set((state) => ({
            panels: state.panels.map((p) =>
              p.id === activePanel
                ? { ...p, code: p.code + '\n\n' + code, updatedAt: new Date().toISOString() }
                : p
            ),
            activeTab: 'canvas',
          }));
        }
      },
    }),
    {
      name: 'vf-playground',
      partialize: (state) => ({
        panels: state.panels,
        activePanel: state.activePanel,
        viewport: state.viewport,
      }),
    }
  )
);
