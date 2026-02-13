import { create } from 'zustand';
import {
  streamQuickChat,
  listQuickChats,
  getQuickChatHistory,
  deleteQuickChat,
  type QuickChatMeta,
  type QuickChatMessage,
  type ProviderName,
} from '@/lib/quickchat-api';

interface QuickChatState {
  isOpen: boolean;
  chats: QuickChatMeta[];
  activeChatId: string | null;
  messages: QuickChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
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
  selectChat: (chatId: string) => Promise<void>;
  newChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopStream: () => void;
  regenerate: () => Promise<void>;
}

let abortController: AbortController | null = null;

export const useQuickChat = create<QuickChatState>((set, get) => ({
  isOpen: false,
  chats: [],
  activeChatId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
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

      // Auto-select an available provider if current one isn't available
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
    set({ activeChatId: chatId, messages: [], error: null });
    try {
      const messages = await getQuickChatHistory(chatId);
      set({ messages });
    } catch {
      set({ error: 'Failed to load chat history' });
    }
  },

  newChat: () => {
    set({
      activeChatId: null,
      messages: [],
      streamingContent: '',
      error: null,
    });
  },

  deleteChat: async (chatId) => {
    try {
      await deleteQuickChat(chatId);
      const { chats, activeChatId } = get();
      const filtered = chats.filter((c) => c.id !== chatId);
      set({
        chats: filtered,
        ...(activeChatId === chatId
          ? { activeChatId: null, messages: [] }
          : {}),
      });
    } catch {
      // Silent fail
    }
  },

  sendMessage: async (content) => {
    const {
      selectedProvider,
      selectedModel,
      activeChatId,
      messages,
      availableProviders,
    } = get();

    // Guard: check provider is available
    if (!availableProviders.includes(selectedProvider)) {
      set({
        error: `No API key configured for ${selectedProvider === 'claude' ? 'Claude' : 'Gemini'}. Add one in Settings > AI Providers.`,
      });
      return;
    }

    // Generate a chat ID if this is a new conversation
    const chatId =
      activeChatId ||
      `qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!activeChatId) {
      set({ activeChatId: chatId });
    }

    // Add user message optimistically
    const userMsg: QuickChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content,
      provider: selectedProvider,
      model: selectedModel,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    set({
      messages: updatedMessages,
      isStreaming: true,
      streamingContent: '',
      error: null,
    });

    // Build history from existing messages (last 20 for context window)
    const history = updatedMessages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    abortController = new AbortController();

    try {
      let fullText = '';

      for await (const event of streamQuickChat({
        chatId,
        message: content,
        provider: selectedProvider,
        model: selectedModel,
        history: history.slice(0, -1),
        signal: abortController.signal,
      })) {
        if (event.type === 'text' && event.content) {
          fullText += event.content;
          set({ streamingContent: fullText });
        } else if (event.type === 'error') {
          set({
            error: event.content || 'Stream error',
            isStreaming: false,
          });
          return;
        } else if (event.type === 'done') {
          fullText = event.fullText || fullText;
        }
      }

      // Add assistant message
      const assistantMsg: QuickChatMessage = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: fullText,
        provider: selectedProvider,
        model: selectedModel,
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isStreaming: false,
        streamingContent: '',
      }));

      // Refresh chat list
      get().loadChats();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        set({ isStreaming: false, streamingContent: '' });
        return;
      }
      set({
        error: err instanceof Error ? err.message : 'Failed to send',
        isStreaming: false,
      });
    } finally {
      abortController = null;
    }
  },

  stopStream: () => {
    abortController?.abort();
    const { streamingContent, messages } = get();

    // If there was partial content, add it as a message
    if (streamingContent) {
      const partialMsg: QuickChatMessage = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: streamingContent + '\n\n*(stopped)*',
        provider: get().selectedProvider,
        createdAt: new Date().toISOString(),
      };
      set({
        messages: [...messages, partialMsg],
        isStreaming: false,
        streamingContent: '',
      });
    } else {
      set({ isStreaming: false, streamingContent: '' });
    }
  },

  regenerate: async () => {
    const { messages, isStreaming } = get();
    if (isStreaming || messages.length < 2) return;

    // Find the last user message content
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove the trailing user+assistant pair so sendMessage can re-add
    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    const trimmed = messages.slice(0, lastUserIdx);
    set({ messages: trimmed });

    // Re-send — sendMessage will add user msg + stream new response
    await get().sendMessage(lastUserMsg.content);
  },
}));
