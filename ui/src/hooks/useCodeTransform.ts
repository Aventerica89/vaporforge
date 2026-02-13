import { create } from 'zustand';
import { streamTransform } from '@/lib/transform-api';

type ProviderName = 'claude' | 'gemini';

interface CodeTransformState {
  isOpen: boolean;
  selectedCode: string;
  language: string;
  filePath: string | undefined;
  instruction: string;
  transformedCode: string;
  isStreaming: boolean;
  error: string | null;
  provider: ProviderName;
  model: string | undefined;

  // Actions
  openTransform: (code: string, language: string, filePath?: string) => void;
  closeTransform: () => void;
  setInstruction: (instruction: string) => void;
  setProvider: (provider: ProviderName, model?: string) => void;
  executeTransform: () => Promise<void>;
  acceptTransform: () => string | null;
  rejectTransform: () => void;
  stopStream: () => void;
}

let abortController: AbortController | null = null;

export const useCodeTransform = create<CodeTransformState>((set, get) => ({
  isOpen: false,
  selectedCode: '',
  language: 'plaintext',
  filePath: undefined,
  instruction: '',
  transformedCode: '',
  isStreaming: false,
  error: null,
  provider: 'claude',
  model: undefined,

  openTransform: (code, language, filePath) => {
    set({
      isOpen: true,
      selectedCode: code,
      language,
      filePath,
      instruction: '',
      transformedCode: '',
      error: null,
      isStreaming: false,
    });
  },

  closeTransform: () => {
    abortController?.abort();
    abortController = null;
    set({
      isOpen: false,
      selectedCode: '',
      instruction: '',
      transformedCode: '',
      error: null,
      isStreaming: false,
    });
  },

  setInstruction: (instruction) => set({ instruction }),

  setProvider: (provider, model) => set({ provider, model }),

  executeTransform: async () => {
    const { selectedCode, instruction, language, filePath, provider, model } =
      get();

    if (!instruction.trim() || !selectedCode) return;

    set({ isStreaming: true, transformedCode: '', error: null });
    abortController = new AbortController();

    try {
      let fullText = '';

      for await (const event of streamTransform({
        code: selectedCode,
        instruction: instruction.trim(),
        language,
        filePath,
        provider,
        model,
        signal: abortController.signal,
      })) {
        if (event.type === 'text' && event.content) {
          fullText += event.content;
          set({ transformedCode: fullText });
        } else if (event.type === 'error') {
          set({
            error: event.content || 'Transform error',
            isStreaming: false,
          });
          return;
        } else if (event.type === 'done') {
          fullText = event.fullText || fullText;
        }
      }

      set({ transformedCode: fullText, isStreaming: false });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        set({ isStreaming: false });
        return;
      }
      set({
        error: err instanceof Error ? err.message : 'Transform failed',
        isStreaming: false,
      });
    } finally {
      abortController = null;
    }
  },

  acceptTransform: () => {
    const { transformedCode } = get();
    if (!transformedCode) return null;
    const code = transformedCode;
    get().closeTransform();
    return code;
  },

  rejectTransform: () => {
    get().closeTransform();
  },

  stopStream: () => {
    abortController?.abort();
    set({ isStreaming: false });
  },
}));
