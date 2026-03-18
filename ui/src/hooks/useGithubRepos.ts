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

export interface GitHubBranch {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
}

interface BranchState {
  branches: GitHubBranch[];
  defaultBranch: string;
  loading: boolean;
}

interface GithubReposState {
  repos: GitHubRepo[];
  username: string;
  avatarUrl: string;
  lastSynced: string | null;
  isSyncing: boolean;
  isLoaded: boolean;

  // Branch picker state
  branchesFor: Record<string, BranchState>;
  selectedBranch: Record<string, string>;
  expandedRepo: string | null;

  loadRepos: () => Promise<void>;
  syncRepos: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  loadUsername: () => Promise<void>;
  loadBranches: (owner: string, repo: string) => Promise<void>;
  selectBranch: (repoFullName: string, branchName: string) => void;
  setExpandedRepo: (repoFullName: string | null) => void;
}

export const useGithubRepos = create<GithubReposState>()(
  persist(
    (set, get) => ({
      repos: [],
      username: '',
      avatarUrl: '',
      lastSynced: null,
      isSyncing: false,
      isLoaded: false,
      branchesFor: {},
      selectedBranch: {},
      expandedRepo: null,

      loadRepos: async () => {
        const { isSyncing, repos } = get();
        if (isSyncing) return;

        try {
          set({ isSyncing: true });
          const response = await githubApi.repos();

          if (response.success && response.data) {
            set({
              repos: response.data.repos || [],
              lastSynced: new Date().toISOString(),
              isLoaded: true,
            });
          } else if (repos.length > 0) {
            set({ isLoaded: true });
          }
        } catch (error) {
          console.error('[GitHub Repos] Failed to load:', error);
          if (repos.length > 0) {
            set({ isLoaded: true });
          }
        } finally {
          set({ isSyncing: false });
        }
      },

      syncRepos: async () => {
        const { isSyncing } = get();
        if (isSyncing) return;

        try {
          set({ isSyncing: true });
          const response = await githubApi.sync();

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
          // Use connection endpoint to get both username and avatarUrl
          const connResponse = await githubApi.getConnection();
          if (connResponse.success && connResponse.data?.connected && connResponse.data.username) {
            set({
              username: connResponse.data.username,
              avatarUrl: connResponse.data.avatarUrl || '',
            });
            return;
          }
          // Fallback to legacy username endpoint
          const response = await githubApi.getUsername();
          if (response.success && response.data?.username) {
            set({ username: response.data.username });
          }
        } catch (error) {
          console.error('[GitHub Repos] Failed to load username:', error);
        }
      },

      loadBranches: async (owner: string, repo: string) => {
        const key = `${owner}/${repo}`;
        const existing = get().branchesFor[key];
        if (existing?.loading) return;

        set((state) => ({
          branchesFor: {
            ...state.branchesFor,
            [key]: { branches: existing?.branches ?? [], defaultBranch: existing?.defaultBranch ?? 'main', loading: true },
          },
        }));

        try {
          const response = await githubApi.branches(owner, repo);
          if (response.success && response.data) {
            set((state) => ({
              branchesFor: {
                ...state.branchesFor,
                [key]: {
                  branches: response.data!.branches,
                  defaultBranch: response.data!.defaultBranch,
                  loading: false,
                },
              },
            }));
          }
        } catch (error) {
          console.error(`[GitHub Repos] Failed to load branches for ${key}:`, error);
          set((state) => ({
            branchesFor: {
              ...state.branchesFor,
              [key]: { ...state.branchesFor[key], loading: false },
            },
          }));
        }
      },

      selectBranch: (repoFullName: string, branchName: string) => {
        set((state) => ({
          selectedBranch: { ...state.selectedBranch, [repoFullName]: branchName },
          expandedRepo: null,
        }));
      },

      setExpandedRepo: (repoFullName: string | null) => {
        set({ expandedRepo: repoFullName });
        // Auto-load branches when expanding
        if (repoFullName) {
          const [owner, repo] = repoFullName.split('/');
          if (owner && repo) {
            get().loadBranches(owner, repo);
          }
        }
      },
    }),
    {
      name: 'vf-github-repos',
      partialize: (state) => ({
        repos: state.repos,
        username: state.username,
        avatarUrl: state.avatarUrl,
        lastSynced: state.lastSynced,
        selectedBranch: state.selectedBranch,
      }),
    }
  )
);

// Auto-load on app start
if (typeof window !== 'undefined') {
  useGithubRepos.getState().loadUsername().then(() => {
    const { username } = useGithubRepos.getState();
    if (username) {
      useGithubRepos.getState().loadRepos();
    }
  });
}
