import { create } from 'zustand';
import { streamAnalyze } from '@/lib/analyze-api';
import { useQuickChat } from '@/hooks/useQuickChat';
import type { CodeAnalysis } from '@/lib/types';

type ProviderName = 'claude' | 'gemini';

interface CodeAnalysisState {
  isOpen: boolean;
  code: string;
  language: string;
  filePath: string | undefined;
  isStreaming: boolean;
  analysis: Partial<CodeAnalysis> | null;
  error: string | null;
  provider: ProviderName;
  model: string | undefined;

  // Actions
  openAnalysis: (code: string, language: string, filePath?: string) => void;
  closeAnalysis: () => void;
  setProvider: (provider: ProviderName, model?: string) => void;
  executeAnalysis: () => Promise<void>;
  stopStream: () => void;
}

let abortController: AbortController | null = null;

export const useCodeAnalysis = create<CodeAnalysisState>((set, get) => ({
  isOpen: false,
  code: '',
  language: 'plaintext',
  filePath: undefined,
  isStreaming: false,
  analysis: null,
  error: null,
  provider: 'claude',
  model: undefined,

  openAnalysis: (code, language, filePath) => {
    const { availableProviders } = useQuickChat.getState();
    const current = get().provider;
    const provider =
      availableProviders.length > 0 && !availableProviders.includes(current)
        ? availableProviders[0]
        : current;
    set({
      isOpen: true,
      code,
      language,
      filePath,
      analysis: null,
      error: null,
      isStreaming: false,
      provider,
    });
  },

  closeAnalysis: () => {
    abortController?.abort();
    abortController = null;
    set({
      isOpen: false,
      code: '',
      analysis: null,
      error: null,
      isStreaming: false,
    });
  },

  setProvider: (provider, model) => set({ provider, model }),

  executeAnalysis: async () => {
    const { code, language, filePath, provider, model } = get();
    if (!code) return;

    const { availableProviders } = useQuickChat.getState();
    if (
      availableProviders.length > 0 &&
      !availableProviders.includes(provider)
    ) {
      const name = provider === 'claude' ? 'Claude' : 'Gemini';
      set({
        error: `No API key configured for ${name}. Add one in Settings > AI Providers.`,
      });
      return;
    }

    set({ isStreaming: true, analysis: null, error: null });
    abortController = new AbortController();

    try {
      let latest: Partial<CodeAnalysis> = {};

      for await (const event of streamAnalyze({
        code,
        language,
        filePath,
        provider,
        model,
        signal: abortController.signal,
      })) {
        if (event.type === 'partial' && event.data) {
          latest = event.data;
          set({ analysis: { ...latest } });
        } else if (event.type === 'done' && event.data) {
          latest = event.data;
        } else if (event.type === 'error') {
          set({
            error: event.content || 'Analysis error',
            isStreaming: false,
          });
          return;
        }
      }

      set({ analysis: { ...latest }, isStreaming: false });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        set({ isStreaming: false });
        return;
      }
      set({
        error: err instanceof Error ? err.message : 'Analysis failed',
        isStreaming: false,
      });
    } finally {
      abortController = null;
    }
  },

  stopStream: () => {
    abortController?.abort();
    set({ isStreaming: false });
  },
}));
