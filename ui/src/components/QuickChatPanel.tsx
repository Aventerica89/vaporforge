import { useState, useRef, useEffect, useCallback } from 'react';
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
  Copy,
  Check,
  BookOpen,
  Bug,
  TestTube2,
  Zap,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useQuickChat } from '@/hooks/useQuickChat';
import { ChatMarkdown } from './chat/ChatMarkdown';
import type { ProviderName } from '@/lib/quickchat-api';

const SUGGESTIONS = [
  { label: 'Explain this codebase', icon: BookOpen },
  { label: 'Find potential bugs', icon: Bug },
  { label: 'Write unit tests', icon: TestTube2 },
  { label: 'Optimize performance', icon: Zap },
] as const;

export function QuickChatPanel() {
  const {
    isOpen,
    closeQuickChat,
    chats,
    activeChatId,
    messages,
    isStreaming,
    streamingContent,
    error,
    selectedProvider,
    availableProviders,
    setProvider,
    selectChat,
    newChat,
    deleteChat,
    sendMessage,
    stopStream,
    regenerate,
  } = useQuickChat();

  const hasAnyProvider = availableProviders.length > 0;

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !showHistory) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, showHistory]);

  // Thinking duration timer
  useEffect(() => {
    if (isStreaming && !streamingContent) {
      setThinkingSeconds(0);
      const interval = setInterval(() => setThinkingSeconds((s) => s + 1), 1000);
      return () => clearInterval(interval);
    }
    setThinkingSeconds(0);
  }, [isStreaming, streamingContent]);

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

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    // Reset textarea height after clearing
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await sendMessage(trimmed);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleCopy = useCallback((text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Auto-resize textarea
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    []
  );

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant')?.id;

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
                  onClick={newChat}
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
                  onClick={() => {
                    selectChat(chat.id);
                    setShowHistory(false);
                  }}
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
            {/* Provider toggle */}
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
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 opacity-20 mb-3" />
                  <p className="text-sm font-medium">Quick Chat</p>
                  <p className="text-xs mt-1 mb-6">
                    Instant AI responses — no sandbox required
                  </p>
                  {hasAnyProvider ? (
                    <div className="flex flex-wrap justify-center gap-2 px-4">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => handleSuggestionClick(s.label)}
                          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-all"
                        >
                          <s.icon className="h-3 w-3" />
                          {s.label}
                        </button>
                      ))}
                    </div>
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

              {messages.map((msg) => (
                <div key={msg.id} className="group/msg space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        msg.role === 'user'
                          ? 'text-primary'
                          : 'text-secondary'
                      }`}
                    >
                      {msg.role === 'user' ? 'You' : 'AI'}
                    </span>
                    {msg.role === 'assistant' && (
                      <ProviderBadge provider={msg.provider} />
                    )}
                  </div>
                  <div
                    className={`relative rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <ChatMarkdown content={msg.content} />
                    {msg.role === 'assistant' && (
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
                          title="Copy"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        {msg.id === lastAssistantId && !isStreaming && (
                            <button
                              onClick={regenerate}
                              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
                              title="Regenerate"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming indicator */}
              {isStreaming && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                      AI
                    </span>
                    <ProviderBadge provider={selectedProvider} />
                  </div>

                  {/* Thinking state (before first text arrives) */}
                  {!streamingContent && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="relative h-3 w-3">
                          <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                          <div className="relative h-3 w-3 rounded-full bg-primary/60" />
                        </div>
                        <span className="text-xs font-medium">Thinking</span>
                        {thinkingSeconds > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                            <Clock className="h-2.5 w-2.5" />
                            {thinkingSeconds}s
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Streaming text */}
                  {streamingContent && (
                    <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                      <ChatMarkdown content={streamingContent} />
                    </div>
                  )}
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
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={hasAnyProvider ? 'Ask anything...' : 'Configure a provider in Settings first'}
                  disabled={!hasAnyProvider}
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    minHeight: '40px',
                    maxHeight: '120px',
                  }}
                />
                {isStreaming ? (
                  <button
                    onClick={stopStream}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Stop"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || !hasAnyProvider}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors"
                    title="Send (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                Enter to send, Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

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
