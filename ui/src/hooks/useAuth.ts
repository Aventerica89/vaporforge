import { create } from 'zustand';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

// OAuth flow states
type OAuthFlowState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'waiting_url'; sessionId: string; debug?: string }
  | { step: 'has_url'; sessionId: string; url: string }
  | { step: 'waiting_code'; sessionId: string; url: string }
  | { step: 'submitting'; sessionId: string }
  | { step: 'success' }
  | { step: 'error'; message: string; debug?: string };

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // OAuth flow state
  oauthFlow: OAuthFlowState;

  // Actions
  checkAuth: () => Promise<void>;
  loginWithApiKey: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;

  // OAuth actions
  startOAuth: () => Promise<void>;
  pollForUrl: () => Promise<void>;
  submitOAuthCode: (code: string) => Promise<boolean>;
  cancelOAuth: () => void;
}

// Polling interval for OAuth URL
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  oauthFlow: { step: 'idle' },

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      // Check for stored Claude credentials
      const creds = authApi.getStoredCredentials();
      if (creds && !authApi.isTokenExpired()) {
        // TODO: Re-authenticate with stored Claude token
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

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
          user: { id: 'user', email: 'user@claude-cloud.local' },
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
      oauthFlow: { step: 'idle' },
    });
  },

  clearError: () => set({ error: null }),

  // Start OAuth flow
  startOAuth: async () => {
    set({
      oauthFlow: { step: 'starting' },
      error: null,
    });

    try {
      const result = await authApi.startOAuth();

      if (result.success && result.data) {
        set({
          oauthFlow: {
            step: 'waiting_url',
            sessionId: result.data.sessionId,
          },
        });

        // Start polling for URL
        get().pollForUrl();
      } else {
        set({
          oauthFlow: {
            step: 'error',
            message: 'Failed to start OAuth',
          },
        });
      }
    } catch (error) {
      set({
        oauthFlow: {
          step: 'error',
          message: error instanceof Error ? error.message : 'Failed to start OAuth',
        },
      });
    }
  },

  // Poll for OAuth URL
  pollForUrl: async () => {
    const state = get().oauthFlow;
    if (state.step !== 'waiting_url') return;

    const { sessionId } = state;
    let attempts = 0;

    const poll = async () => {
      const currentState = get().oauthFlow;

      // Stop if state changed (cancelled, etc.)
      if (currentState.step !== 'waiting_url') return;

      attempts++;

      try {
        const result = await authApi.pollOAuthStatus(sessionId);

        if (result.success && result.data) {
          const session = result.data as {
            state: string;
            oauthUrl?: string;
            error?: string;
            debug?: { output?: string; claudeCheck?: string; error?: string };
          };

          if (session.state === 'has_url' && session.oauthUrl) {
            set({
              oauthFlow: {
                step: 'has_url',
                sessionId,
                url: session.oauthUrl,
              },
            });
            return;
          }

          if (session.state === 'error') {
            const debugStr = session.debug
              ? JSON.stringify(session.debug, null, 2)
              : undefined;
            set({
              oauthFlow: {
                step: 'error',
                message: session.error || 'OAuth failed',
                debug: debugStr,
              },
            });
            return;
          }

          // Update debug info while waiting
          if (session.debug) {
            const currentState = get().oauthFlow;
            if (currentState.step === 'waiting_url') {
              set({
                oauthFlow: {
                  ...currentState,
                  debug: JSON.stringify(session.debug, null, 2),
                },
              });
            }
          }
        }

        // Continue polling if under max attempts
        if (attempts < MAX_POLL_ATTEMPTS) {
          setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          const currentState = get().oauthFlow;
          const debugInfo = currentState.step === 'waiting_url'
            ? currentState.debug
            : undefined;
          set({
            oauthFlow: {
              step: 'error',
              message: 'Timeout waiting for OAuth URL. The Claude CLI may not be available.',
              debug: debugInfo,
            },
          });
        }
      } catch (error) {
        set({
          oauthFlow: {
            step: 'error',
            message: error instanceof Error ? error.message : 'Polling failed',
          },
        });
      }
    };

    // Start polling
    poll();
  },

  // Submit OAuth code
  submitOAuthCode: async (code: string) => {
    const state = get().oauthFlow;

    if (state.step !== 'has_url' && state.step !== 'waiting_code') {
      return false;
    }

    const { sessionId, url } = state;

    set({
      oauthFlow: { step: 'submitting', sessionId },
      error: null,
    });

    try {
      const result = await authApi.submitOAuthCode(sessionId, code);

      if (result.success && result.data) {
        set({ oauthFlow: { step: 'success' } });

        // Now authenticate with the Claude token
        // For now, just use the token directly to create a session
        const token = result.data.accessToken;

        // Create user and session token
        const authResult = await fetch('/api/auth/claude-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token }),
        });

        if (authResult.ok) {
          const data = await authResult.json();
          if (data.success && data.data) {
            localStorage.setItem('auth_token', data.data.token);
            set({
              user: data.data.user,
              isAuthenticated: true,
              oauthFlow: { step: 'idle' },
            });
            return true;
          }
        }

        // Fallback: just mark as authenticated with token
        set({
          isAuthenticated: true,
          oauthFlow: { step: 'idle' },
          user: { id: 'claude_user', email: 'user@claude.ai' },
        });

        return true;
      }

      set({
        oauthFlow: {
          step: 'waiting_code',
          sessionId,
          url,
        },
        error: result.error || 'Invalid code',
      });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit code';

      set({
        oauthFlow: {
          step: 'waiting_code',
          sessionId,
          url,
        },
        error: errorMessage,
      });
      return false;
    }
  },

  // Cancel OAuth
  cancelOAuth: () => {
    const state = get().oauthFlow;

    if ('sessionId' in state) {
      authApi.cancelOAuth(state.sessionId);
    }

    set({
      oauthFlow: { step: 'idle' },
      error: null,
    });
  },
}));
