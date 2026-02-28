import { create } from 'zustand';
import { useQuickChat } from '@/hooks/useQuickChat';
import { useSandboxStore } from '@/hooks/useSandbox';
import { gitApi } from '@/lib/api';
import type { CommitMessage, ApiResponse } from '@/lib/types';

type ProviderName = 'claude' | 'gemini' | 'openai';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface CommitMessageState {
  isOpen: boolean;
  isGenerating: boolean;
  commitMessage: CommitMessage | null;
  error: string | null;
  provider: ProviderName;

  // Actions
  generateCommitMessage: (
    diff: string,
    stagedFiles: string[]
  ) => Promise<void>;
  editField: <K extends keyof CommitMessage>(
    field: K,
    value: CommitMessage[K]
  ) => void;
  dismiss: () => void;
  setProvider: (provider: ProviderName) => void;
  /** Format the commit message as a string */
  formatted: () => string | null;
}

export const useCommitMessage = create<CommitMessageState>((set, get) => ({
  isOpen: false,
  isGenerating: false,
  commitMessage: null,
  error: null,
  provider: 'claude',

  generateCommitMessage: async (diff, stagedFiles) => {
    const { provider } = get();

    const { availableProviders } = useQuickChat.getState();
    if (
      availableProviders.length > 0 &&
      !availableProviders.includes(provider)
    ) {
      const name = provider === 'claude' ? 'Claude' : provider === 'openai' ? 'OpenAI' : 'Gemini';
      set({
        isOpen: true,
        error: `No API key for ${name}. Add one in Settings > AI Providers.`,
      });
      return;
    }

    set({
      isOpen: true,
      isGenerating: true,
      commitMessage: null,
      error: null,
    });

    try {
      const response = await fetch(`${API_BASE}/commit-msg/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ diff, stagedFiles, provider }),
      });

      const result = (await response.json()) as ApiResponse<CommitMessage>;

      if (!result.success || !result.data) {
        set({
          error: result.error || 'Failed to generate commit message',
          isGenerating: false,
        });
        return;
      }

      set({ commitMessage: result.data, isGenerating: false });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Commit message generation failed',
        isGenerating: false,
      });
    }
  },

  editField: (field, value) => {
    const { commitMessage } = get();
    if (!commitMessage) return;
    set({ commitMessage: { ...commitMessage, [field]: value } });
  },

  dismiss: () => {
    set({
      isOpen: false,
      commitMessage: null,
      error: null,
      isGenerating: false,
    });
  },

  setProvider: (provider) => set({ provider }),

  formatted: () => {
    const { commitMessage } = get();
    if (!commitMessage) return null;

    const { type, scope, subject, body, breaking } = commitMessage;
    const prefix = scope ? `${type}(${scope})` : type;
    const bangPrefix = breaking ? `${prefix}!` : prefix;
    const headline = `${bangPrefix}: ${subject}`;

    if (body) {
      return `${headline}\n\n${body}`;
    }
    return headline;
  },
}));

/** Fetch staged (or working) diff and trigger commit message generation. */
export async function triggerCommitMessage(): Promise<void> {
  const { currentSession, gitStatus } = useSandboxStore.getState();
  if (!currentSession || !gitStatus) return;

  const hasChanges =
    gitStatus.staged.length > 0 ||
    gitStatus.modified.length > 0 ||
    gitStatus.untracked.length > 0;
  if (!hasChanges) return;

  const staged = gitStatus.staged.length > 0;
  try {
    const result = await gitApi.diff(currentSession.id, undefined, staged);
    const diff = result.data?.diff || '';
    if (!diff.trim()) return;
    const files = staged
      ? gitStatus.staged
      : [...gitStatus.modified, ...gitStatus.untracked];
    useCommitMessage.getState().generateCommitMessage(diff, files);
  } catch {
    // No git repo or diff error — silently ignore
  }
}
