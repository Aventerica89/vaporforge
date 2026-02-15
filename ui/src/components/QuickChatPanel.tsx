import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  X,
  Send,
  MessageSquare,
  Trash2,
  Plus,
  Square,
  ChevronLeft,
  Sparkles,
  Crown,
  BookOpen,
  Bug,
  TestTube2,
  Zap,
  Clock,
} from 'lucide-react';
import { useQuickChat } from '@/hooks/useQuickChat';
import { ChatMarkdown } from './chat/ChatMarkdown';
import { ReasoningBlock } from './chat/ReasoningBlock';
import { MessageActions } from './chat/MessageActions';
import { Suggestions, Suggestion } from './ai-elements/Suggestion';
import { Shimmer } from './ai-elements/Shimmer';
import type { ProviderName } from '@/lib/quickchat-api';

const SUGGESTIONS = [
  { label: 'Explain this codebase', icon: BookOpen },
  { label: 'Find potential bugs', icon: Bug },
  { label: 'Write unit tests', icon: TestTube2 },
  { label: 'Optimize performance', icon: Zap },
] as const;

const MODEL_OPTIONS: Record<ProviderName, string[]> = {
  claude: ['sonnet', 'haiku', 'opus'],
  gemini: ['flash', 'pro'],
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Extract text from UIMessage parts */
function getMessageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && 'text' in p)
    .map((p) => p.text)
    .join('');
}

/** Extract reasoning from UIMessage parts */
function getMessageReasoning(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => ('text' in p ? p.text : ''))
    .join('');
}

export function QuickChatPanel() {
  const {
    isOpen,
    closeQuickChat,
    chats,
    activeChatId,
    error: panelError,
    selectedProvider,
    selectedModel,
    availableProviders,
    setProvider,
    selectChat,
    newChat,
    deleteChat,
    loadChats,
    setError,
  } = useQuickChat();

  const hasAnyProvider = availableProviders.length > 0;

  // Generate stable chatId for new conversations
  const chatId = useMemo(
    () => activeChatId || `qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [activeChatId]
  );

  // Ref holds latest body values — avoids stale closure when useChat
  // keeps its internal transport reference after prop changes
  const bodyRef = useRef({ chatId, selectedProvider, selectedModel });
  bodyRef.current = { chatId, selectedProvider, selectedModel };

  // AI SDK v6 transport — handles HTTP + UIMessageStream protocol
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/quickchat/stream',
        headers: () => getAuthHeaders(),
        body: () => ({
          chatId: bodyRef.current.chatId,
          provider: bodyRef.current.selectedProvider,
          model: bodyRef.current.selectedModel,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // AI SDK v6 useChat — transport-based architecture
  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    error: chatError,
  } = useChat({
    id: chatId,
    transport,
    onFinish: () => {
      loadChats();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Extract clean error message — DefaultChatTransport may wrap
  // the full JSON response body as the error message
  const rawError = panelError || (chatError ? chatError.message : null);
  const error = (() => {
    if (!rawError) return null;
    try {
      const parsed = JSON.parse(rawError);
      return parsed.error || rawError;
    } catch {
      return rawError;
    }
  })();

  // Local input state (v6 useChat no longer manages input)
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !showHistory) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, showHistory]);

  // Thinking duration timer
  useEffect(() => {
    if (status === 'submitted') {
      setThinkingSeconds(0);
      const interval = setInterval(() => setThinkingSeconds((s) => s + 1), 1000);
      return () => clearInterval(interval);
    }
    setThinkingSeconds(0);
  }, [status]);

  // Cmd+Shift+Q shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'q') {
        e.preventDefault();
        useQuickChat.getState().toggleQuickChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle chat selection — load history from KV into useChat
  const handleSelectChat = useCallback(
    async (id: string) => {
      const history = await selectChat(id);
      const aiMessages: UIMessage[] = history.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: m.content }],
      }));
      setMessages(aiMessages);
      setShowHistory(false);
    },
    [selectChat, setMessages]
  );

  // Handle new chat — clear useChat messages
  const handleNewChat = useCallback(() => {
    newChat();
    setMessages([]);
    setInput('');
  }, [newChat, setMessages]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (!hasAnyProvider || isStreaming) return;
      sendMessage({ text });
    },
    [hasAnyProvider, isStreaming, sendMessage]
  );

  // Send message
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    if (!hasAnyProvider) {
      setError(
        `No API key configured for ${selectedProvider === 'claude' ? 'Claude' : 'Gemini'}. Add one in Settings > AI Providers.`
      );
      return;
    }
    setError(null);
    sendMessage({ text: trimmed });
    setInput('');
  }, [input, isStreaming, hasAnyProvider, selectedProvider, sendMessage, setError]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Find last assistant message index for streaming indicator
  const lastAssistantIdx = messages.length - 1 -
    [...messages].reverse().findIndex((m) => m.role === 'assistant');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeQuickChat}
      />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-lg flex-col bg-background border-l border-border shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            {showHistory && (
              <button
                onClick={() => setShowHistory(false)}
                className="rounded p-1 hover:bg-accent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider">
              {showHistory ? 'Chat History' : 'Quick Chat'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!showHistory && (
              <>
                <button
                  onClick={() => setShowHistory(true)}
                  className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="Chat history"
                >
                  History
                </button>
                <button
                  onClick={handleNewChat}
                  className="rounded p-1 hover:bg-accent"
                  title="New chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              onClick={closeQuickChat}
              className="rounded p-1 hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showHistory ? (
          /* Chat list */
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30 mb-2" />
                <p className="text-sm">No chats yet</p>
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all ${
                    activeChatId === chat.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {chat.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <ProviderBadge provider={chat.provider} />
                      <span className="text-[10px] text-muted-foreground">
                        {chat.messageCount} msgs
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Provider toggle + model selector */}
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
              <ProviderToggle
                provider="claude"
                selected={selectedProvider === 'claude'}
                available={availableProviders.includes('claude')}
                onClick={() => setProvider('claude')}
                icon={<Crown className="h-3.5 w-3.5" />}
                label="Claude"
              />
              <ProviderToggle
                provider="gemini"
                selected={selectedProvider === 'gemini'}
                available={availableProviders.includes('gemini')}
                onClick={() => setProvider('gemini')}
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Gemini"
              />
              <div className="ml-auto">
                <select
                  value={selectedModel || MODEL_OPTIONS[selectedProvider][0]}
                  onChange={(e) => setProvider(selectedProvider, e.target.value)}
                  disabled={!hasAnyProvider}
                  className="rounded-md border border-border/50 bg-muted px-2 py-0.5 text-[11px] text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-40 cursor-pointer"
                >
                  {MODEL_OPTIONS[selectedProvider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 opacity-20 mb-3" />
                  <p className="text-sm font-medium">Quick Chat</p>
                  <p className="text-xs mt-1 mb-4">
                    Instant AI responses — no sandbox required
                  </p>
                  {hasAnyProvider && (
                    <div className="mb-6">
                      <ProviderBadge provider={selectedProvider} />
                    </div>
                  )}
                  {hasAnyProvider ? (
                    <Suggestions className="justify-center px-4">
                      {SUGGESTIONS.map((s) => (
                        <Suggestion
                          key={s.label}
                          suggestion={s.label}
                          icon={<s.icon className="h-3.5 w-3.5" />}
                          onClick={handleSuggestionClick}
                        />
                      ))}
                    </Suggestions>
                  ) : (
                    <div className="text-center px-6">
                      <p className="text-xs text-yellow-400 mb-2">
                        No AI providers configured
                      </p>
                      <p className="text-[10px] leading-relaxed">
                        Add an API key in Settings &gt; AI Providers to enable
                        Quick Chat with Claude or Gemini.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg, idx) => (
                <QuickChatMessage
                  key={msg.id}
                  msg={msg}
                  isLastAssistant={idx === lastAssistantIdx}
                  isStreaming={isStreaming}
                  provider={selectedProvider}
                />
              ))}

              {/* Waiting indicator (submitted but no content yet) */}
              {status === 'submitted' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                      AI
                    </span>
                    <ProviderBadge provider={selectedProvider} />
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="relative h-3 w-3">
                        <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                        <div className="relative h-3 w-3 rounded-full bg-primary/60" />
                      </div>
                      <Shimmer className="text-xs font-medium">Thinking...</Shimmer>
                      {thinkingSeconds > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                          <Clock className="h-2.5 w-2.5" />
                          {thinkingSeconds}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={hasAnyProvider ? 'Ask anything...' : 'Configure a provider in Settings first'}
                  disabled={!hasAnyProvider}
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Stop"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || !hasAnyProvider}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors"
                    title="Send (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-[10px] text-muted-foreground">
                  Enter to send, Shift+Enter for new line
                </span>
                <span className={`text-[10px] text-muted-foreground/60 transition-opacity ${input.length > 100 ? 'opacity-100' : 'opacity-0'}`}>
                  {input.length}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -- Sub-components ---------------------------------------- */

function ProviderToggle({
  selected,
  available,
  onClick,
  icon,
  label,
}: {
  provider: ProviderName;
  selected: boolean;
  available: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      title={available ? label : `${label} — no API key configured`}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
        !available
          ? 'text-muted-foreground/40 border border-transparent cursor-not-allowed'
          : selected
            ? 'bg-primary/10 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
      }`}
    >
      {icon}
      {label}
      {!available && (
        <span className="text-[9px] opacity-60">n/a</span>
      )}
    </button>
  );
}

function QuickChatMessage({
  msg,
  isLastAssistant,
  isStreaming,
  provider,
}: {
  msg: UIMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  provider: ProviderName;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-sm text-foreground">
          <ChatMarkdown content={getMessageText(msg)} />
        </div>
      </div>
    );
  }

  const reasoningText = getMessageReasoning(msg);
  const textContent = getMessageText(msg);

  return (
    <div className="group/message space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
          AI
        </span>
        <ProviderBadge provider={provider} />
      </div>

      {reasoningText && (
        <ReasoningBlock
          content={reasoningText}
          isStreaming={isLastAssistant && isStreaming}
        />
      )}

      <div className="rounded-lg border-l-2 border-secondary/20 bg-muted px-3 py-2 text-sm">
        <ChatMarkdown content={textContent} />
      </div>

      {!isStreaming && (
        <MessageActions content={textContent} />
      )}
    </div>
  );
}

function ProviderBadge({ provider }: { provider: ProviderName }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-medium ${
        provider === 'claude'
          ? 'bg-orange-500/10 text-orange-400'
          : 'bg-blue-500/10 text-blue-400'
      }`}
    >
      {provider === 'claude' ? (
        <Crown className="h-2.5 w-2.5" />
      ) : (
        <Sparkles className="h-2.5 w-2.5" />
      )}
      {provider}
    </span>
  );
}
