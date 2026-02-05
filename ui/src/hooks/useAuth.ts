import { create } from 'zustand';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  loginWithApiKey: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      // Validate token by making a request
      const response = await fetch('/api/sessions/list', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        // Token is valid
        set({
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user', email: 'user@vaporforge.local' },
        });
      } else {
        localStorage.removeItem('auth_token');
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch {
      localStorage.removeItem('auth_token');
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  loginWithApiKey: async (apiKey: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await authApi.loginWithApiKey(apiKey);

      if (result.success && result.data) {
        set({
          user: result.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      set({
        error: result.error || 'Login failed',
        isLoading: false,
      });
      return false;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false,
      });
      return false;
    }
  },

  logout: () => {
    authApi.logout();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
