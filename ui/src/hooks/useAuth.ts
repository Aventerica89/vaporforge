import { create } from 'zustand';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    const token = localStorage.getItem('session_token');

    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const response = await fetch('/api/sessions/list', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        // Decode the JWT payload to recover the real user id + email + role
        let userId = 'user';
        let email = 'user@claude-cloud.local';
        let role: 'user' | 'admin' = 'user';
        try {
          // JWT uses base64url encoding — convert to standard base64 before decoding
          const b64url = token.split('.')[1];
          const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(b64));
          if (payload.sub) userId = payload.sub;
          if (payload.email) email = payload.email;
          if (payload.role === 'admin') role = 'admin';
        } catch { /* use defaults */ }

        set({
          isAuthenticated: true,
          isAdmin: role === 'admin',
          isLoading: false,
          user: { id: userId, email, role },
        });
      } else {
        localStorage.removeItem('session_token');
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch {
      localStorage.removeItem('session_token');
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  login: async (token: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await authApi.setupWithToken(token);
      localStorage.setItem('session_token', result.sessionToken);
      set({
        user: result.user,
        isAuthenticated: true,
        isAdmin: result.user.role === 'admin',
        isLoading: false,
      });
      return true;
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
      isAdmin: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
