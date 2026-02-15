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

  // Provider selection
  selectedProvider: ProviderName;
  selectedModel: string | undefined;
  availableProviders: ProviderName[];

  // Actions
  openQuickChat: () => void;
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
  availableProviders: [],

  openQuickChat: () => {
    set({ isOpen: true });
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

  setProvider: (provider, model) =>
    set({ selectedProvider: provider, selectedModel: model }),

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
