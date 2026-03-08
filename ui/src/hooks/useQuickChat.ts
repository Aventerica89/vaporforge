import { create } from 'zustand';
import {
  listQuickChats,
  getQuickChatHistory,
  deleteQuickChat,
  type QuickChatMeta,
  type QuickChatMessage,
  type ProviderName,
} from '@/lib/quickchat-api';

/**
 * Panel-only state for Quick Chat.
 * Message streaming is handled by AI SDK useChat in QuickChatPanel.
 */
interface QuickChatState {
  isOpen: boolean;
  chats: QuickChatMeta[];
  activeChatId: string | null;
  error: string | null;

  // Provider selection — each provider remembers its last selected model
  selectedProvider: ProviderName;
  selectedModel: string | undefined;
  modelPerProvider: Partial<Record<ProviderName, string>>;
  availableProviders: ProviderName[];

  // Sentinel preload — set before opening so QuickChat auto-sends the prompt
  pendingSentinelPrompt: string | null;

  // Actions
  openQuickChat: () => void;
  openWithSentinel: (prompt: string) => void;
  closeQuickChat: () => void;
  toggleQuickChat: () => void;
  setProvider: (provider: ProviderName, model?: string) => void;
  loadChats: () => Promise<void>;
  selectChat: (chatId: string) => Promise<QuickChatMessage[]>;
  newChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useQuickChat = create<QuickChatState>((set, get) => ({
  isOpen: false,
  chats: [],
  activeChatId: null,
  error: null,
  selectedProvider: 'claude',
  selectedModel: undefined,
  modelPerProvider: {},
  availableProviders: [],
  pendingSentinelPrompt: null,

  openQuickChat: () => {
    set({ isOpen: true });
    get().loadChats();
  },

  openWithSentinel: (prompt: string) => {
    set({ isOpen: true, pendingSentinelPrompt: prompt });
    get().loadChats();
  },

  closeQuickChat: () => set({ isOpen: false }),

  toggleQuickChat: () => {
    const { isOpen } = get();
    if (isOpen) {
      set({ isOpen: false });
    } else {
      set({ isOpen: true });
      get().loadChats();
    }
  },

  /**
   * Switch provider and/or model. Switching provider tabs (no model arg)
   * restores the last model used for that provider — no more reset to default.
   */
  setProvider: (provider, model) => {
    const { modelPerProvider } = get();
    const updatedPerProvider = model !== undefined
      ? { ...modelPerProvider, [provider]: model }
      : modelPerProvider;
    set({
      selectedProvider: provider,
      selectedModel: updatedPerProvider[provider],
      modelPerProvider: updatedPerProvider,
    });
  },

  loadChats: async () => {
    try {
      const result = await listQuickChats();
      const { selectedProvider } = get();

      let provider = selectedProvider;
      if (
        result.availableProviders.length > 0 &&
        !result.availableProviders.includes(selectedProvider)
      ) {
        provider = result.availableProviders[0];
      }

      set({
        chats: result.chats,
        availableProviders: result.availableProviders,
        selectedProvider: provider,
      });
    } catch {
      // Silent fail
    }
  },

  selectChat: async (chatId) => {
    set({ activeChatId: chatId, error: null });
    try {
      return await getQuickChatHistory(chatId);
    } catch {
      set({ error: 'Failed to load chat history' });
      return [];
    }
  },

  newChat: () => {
    set({ activeChatId: null, error: null });
  },

  deleteChat: async (chatId) => {
    try {
      await deleteQuickChat(chatId);
      const { chats, activeChatId } = get();
      const filtered = chats.filter((c) => c.id !== chatId);
      set({
        chats: filtered,
        ...(activeChatId === chatId
          ? { activeChatId: null }
          : {}),
      });
    } catch {
      // Silent fail
    }
  },

  setError: (error) => set({ error }),
}));
