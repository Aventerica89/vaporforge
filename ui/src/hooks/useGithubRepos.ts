import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { githubApi } from '@/lib/api';

export interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  fork: boolean;
}

interface GithubReposState {
  repos: GitHubRepo[];
  username: string;
  lastSynced: string | null;
  isSyncing: boolean;
  isLoaded: boolean;

  loadRepos: () => Promise<void>;
  syncRepos: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  loadUsername: () => Promise<void>;
}

export const useGithubRepos = create<GithubReposState>()(
  persist(
    (set, get) => ({
      repos: [],
      username: '',
      lastSynced: null,
      isSyncing: false,
      isLoaded: false,

      loadRepos: async () => {
        const { username, isSyncing } = get();
        if (!username.trim() || isSyncing) return;

        try {
          set({ isSyncing: true });
          const response = await githubApi.repos(username);

          if (response.success && response.data) {
            set({
              repos: response.data.repos || [],
              lastSynced: new Date().toISOString(),
              isLoaded: true,
            });
          }
        } catch (error) {
          console.error('[GitHub Repos] Failed to load:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      syncRepos: async () => {
        const { username, isSyncing } = get();
        if (!username.trim() || isSyncing) return;

        try {
          set({ isSyncing: true });
          const response = await githubApi.sync(username);

          if (response.success && response.data) {
            set({
              repos: response.data.repos || [],
              lastSynced: new Date().toISOString(),
              isLoaded: true,
            });
          }
        } catch (error) {
          console.error('[GitHub Repos] Failed to sync:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      setUsername: async (username: string) => {
        set({ username });
        try {
          await githubApi.saveUsername(username);
        } catch (error) {
          console.error('[GitHub Repos] Failed to save username:', error);
        }
      },

      loadUsername: async () => {
        try {
          const response = await githubApi.getUsername();
          if (response.success && response.data?.username) {
            set({ username: response.data.username });
          }
        } catch (error) {
          console.error('[GitHub Repos] Failed to load username:', error);
        }
      },
    }),
    {
      name: 'vf-github-repos',
      partialize: (state) => ({
        repos: state.repos,
        username: state.username,
        lastSynced: state.lastSynced,
      }),
    }
  )
);

// Auto-load on app start
if (typeof window !== 'undefined') {
  // Load username from backend, then load repos if username exists
  useGithubRepos.getState().loadUsername().then(() => {
    const { username } = useGithubRepos.getState();
    if (username) {
      useGithubRepos.getState().loadRepos();
    }
  });
}
