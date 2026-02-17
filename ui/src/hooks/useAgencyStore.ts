import { create } from 'zustand';

export interface AgencySite {
  id: string;
  name: string;
  repoUrl: string;
  pagesUrl?: string;
  domain?: string;
  lastEdited?: string;
  thumbnail?: string;
  status: 'live' | 'staging' | 'building';
}

interface AgencyState {
  sites: AgencySite[];
  isLoading: boolean;
  error: string | null;
  dashboardOpen: boolean;
  editorOpen: boolean;
  editingSiteId: string | null;
  previewUrl: string | null;

  openDashboard: () => void;
  closeDashboard: () => void;
  fetchSites: () => Promise<void>;
  createSite: (data: {
    name: string;
    repoUrl: string;
    pagesUrl?: string;
    domain?: string;
  }) => Promise<AgencySite>;
  deleteSite: (id: string) => Promise<void>;
  openEditor: (siteId: string) => void;
  closeEditor: () => void;
  setPreviewUrl: (url: string | null) => void;
}

export const useAgencyStore = create<AgencyState>((set) => ({
  sites: [],
  isLoading: false,
  error: null,
  dashboardOpen: false,
  editorOpen: false,
  editingSiteId: null,
  previewUrl: null,

  openDashboard: () => set({ dashboardOpen: true }),
  closeDashboard: () => set({ dashboardOpen: false }),

  fetchSites: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/agency/sites', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch sites');
      const json = await res.json();
      set({ sites: json.data, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed',
        isLoading: false,
      });
    }
  },

  createSite: async (data) => {
    const token = localStorage.getItem('session_token');
    const res = await fetch('/api/agency/sites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create site');
    const json = await res.json();
    const site = json.data as AgencySite;
    set((s) => ({ sites: [site, ...s.sites] }));
    return site;
  },

  deleteSite: async (id) => {
    const token = localStorage.getItem('session_token');
    await fetch(`/api/agency/sites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    set((s) => ({ sites: s.sites.filter((site) => site.id !== id) }));
  },

  openEditor: (siteId) =>
    set({
      editorOpen: true,
      dashboardOpen: false,
      editingSiteId: siteId,
    }),

  closeEditor: () =>
    set({
      editorOpen: false,
      editingSiteId: null,
      previewUrl: null,
    }),

  setPreviewUrl: (url) => set({ previewUrl: url }),
}));
