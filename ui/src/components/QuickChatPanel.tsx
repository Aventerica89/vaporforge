import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSmoothText } from '@/hooks/useSmoothText';
import { MessageResponse } from './ai-elements/message';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage, type DynamicToolUIPart } from 'ai';
import {
  X,
  MessageSquare,
  Trash2,
  Plus,
  ChevronLeft,
  Sparkles,
  Crown,
  BookOpen,
  Bug,
  TestTube2,
  Zap,
  Clock,
  Wrench,
  Database,
  Loader2,
  RefreshCw,
  Bot,
  ArrowUp,
  Square,
  Mic,
  Github,
  FileText,
  GitBranch,
  FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickChat } from '@/hooks/useQuickChat';
import { useSandboxStore } from '@/hooks/useSandbox';
import { ChatMarkdown } from './chat/ChatMarkdown';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './ai-elements/reasoning';
import { MessageActions } from './chat/MessageActions';
import { Suggestions, Suggestion } from './ai-elements/Suggestion';
import { Shimmer } from './ai-elements/Shimmer';
import { Tool, ToolHeader, ToolContent, ToolSchemaInput, ToolOutput, ToolCitation } from './ai-elements/tool';
import { Confirmation } from './ai-elements/Confirmation';
import { QuestionFlow } from './ai-elements/QuestionFlow';
import { PlanCard } from './ai-elements/plan';
import { Sources, SourcesTrigger, SourcesContent, type SourceFile } from './ai-elements/Sources';
import { embeddingsApi } from '@/lib/api';
import { extractRepoName } from '@/lib/session-names';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import type { ProviderName } from '@/lib/quickchat-api';

const SUGGESTIONS = [
  { label: 'Explain this codebase', icon: BookOpen },
  { label: 'Find potential bugs', icon: Bug },
  { label: 'Write unit tests', icon: TestTube2 },
  { label: 'Optimize performance', icon: Zap },
] as const;

const QC_COMMANDS = [
  { cmd: '/explain',  icon: BookOpen,  prompt: 'Explain how this codebase works — architecture, key files, and main patterns.' },
  { cmd: '/bugs',     icon: Bug,       prompt: 'Find potential bugs and security issues in this codebase.' },
  { cmd: '/tests',    icon: TestTube2, prompt: 'Write unit tests for the most critical functions in this project.' },
  { cmd: '/optimize', icon: Zap,       prompt: 'Identify performance bottlenecks and suggest optimizations.' },
  { cmd: '/issue',    icon: Github,    prompt: 'Create a GitHub issue for: ' },
  { cmd: '/docs',     icon: FileText,        prompt: 'Generate documentation for the main modules in this project.' },
  { cmd: '/t-file',   icon: FlaskConical,    prompt: 'Use runCommand to create a file at /tmp/test.txt containing a short poem, then read it back.' },
  { cmd: '/t-approve',icon: FlaskConical,    prompt: 'Use runCommand to run: echo "approval works" && ls /tmp' },
  { cmd: '/t-deny',   icon: FlaskConical,    prompt: 'Use runCommand to run: echo "this should prompt approval". Wait for my response before continuing.' },
] as const;

const MODEL_OPTIONS: Record<ProviderName, string[]> = {
  claude: ['sonnet', 'haiku', 'opus'],
  gemini: ['flash', 'pro', '3.1-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini'],
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
    pendingSentinelPrompt,
    setProvider,
    selectChat,
    newChat,
    deleteChat,
    loadChats,
    setError,
  } = useQuickChat();

  const hasAnyProvider = availableProviders.length > 0;

  // Active sandbox session — enables tool-calling agent mode
  const currentSession = useSandboxStore((s) => s.currentSession);
  const activeSessionId = currentSession?.id;
  const gitStatus = useSandboxStore((s) => s.gitStatus);

  // Stable ID for new chats — refreshed on every handleNewChat to prevent
  // AI SDK from sharing message state across conversations
  const [localChatId, setLocalChatId] = useState(
    () => `qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const chatId = activeChatId || localChatId;

  // Track which provider generated each assistant message.
  // Populated in onFinish (once per completed message) — reliable and
  // avoids the stale-closure problems of the bodyRef/useEffect pattern.
  const [messageProviders, setMessageProviders] = useState<Record<string, ProviderName>>({});
  const lastSentProviderRef = useRef<ProviderName>(selectedProvider);

  // Ref holds the last-sent body fields (chatId, provider, model, sessionId).
  // The transport reads this on every request — including the automatic
  // follow-up POST triggered by sendAutomaticallyWhen after tool approval,
  // which does not re-use the body from the original sendMessage call.
  const dynamicBodyRef = useRef<{
    chatId: string;
    provider: string;
    model?: string;
    sessionId?: string;
  }>({ chatId: localChatId, provider: selectedProvider });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/quickchat/stream',
        headers: () => getAuthHeaders(),
        body: () => dynamicBodyRef.current,
      }),
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
    addToolApprovalResponse,
  } = useChat({
    id: chatId,
    transport,
    // Automatically re-POST after the user approves a tool so the server
    // can execute it and continue the stream.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message }) => {
      // Record which provider generated this assistant message
      setMessageProviders((prev) => ({
        ...prev,
        [message.id]: lastSentProviderRef.current,
      }));
      loadChats();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Extract clean error message — DefaultChatTransport may wrap
  // the full JSON response body as the error message.
  // Google/OpenAI APIs return {"error": {"type","code","message","param"}} —
  // we must extract the string, not return the nested object (React error #31).
  const rawError = panelError || (chatError ? chatError.message : null);
  const error = (() => {
    if (!rawError) return null;
    try {
      const parsed = JSON.parse(rawError);
      const e = parsed.error;
      if (typeof e === 'string') return e;
      if (typeof e === 'object' && e !== null) return (e as Record<string, unknown>).message as string || JSON.stringify(e);
      return rawError;
    } catch {
      return rawError;
    }
  })();

  // Local input state (v6 useChat no longer manages input)
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandMenuIndex, setCommandMenuIndex] = useState(0);
  const helpRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // H7 HIG fix: Focus trap keeps keyboard navigation inside the panel.
  const panelRef = useFocusTrap(isOpen, closeQuickChat) as React.RefObject<HTMLDivElement>;

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !showHistory) {
      setTimeout(() => {
        panelRef.current?.querySelector('textarea')?.focus();
      }, 200);
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

  // Cmd+Shift+C shortcut (was Q, but macOS Cmd+Shift+Q = Log Out)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        useQuickChat.getState().toggleQuickChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close help popover on click outside
  useEffect(() => {
    if (!showHelp) return;
    const handleClick = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHelp]);

  // Load git status when panel opens with an active session
  useEffect(() => {
    if (isOpen && activeSessionId) {
      useSandboxStore.getState().loadGitStatus();
    }
  }, [isOpen, activeSessionId]);

  // Handle chat selection — load history from KV into useChat
  const handleSelectChat = useCallback(
    async (id: string) => {
      const history = await selectChat(id);

      // Restore provider/model from chat metadata so the provider bar matches
      const chatMeta = chats.find((c) => c.id === id);
      if (chatMeta) {
        setProvider(chatMeta.provider, chatMeta.model);
        lastSentProviderRef.current = chatMeta.provider;
      }

      // Populate provider map from persisted message records
      const providers: Record<string, ProviderName> = {};
      for (const m of history) {
        providers[m.id] = m.provider;
      }
      setMessageProviders(providers);

      const aiMessages: UIMessage[] = history.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: m.content }],
      }));
      setMessages(aiMessages);
      setShowHistory(false);
    },
    [selectChat, setMessages, chats, setProvider]
  );

  // Handle new chat — clear messages and assign a fresh chatId so the new
  // conversation does not share AI SDK state with the previous one
  const handleNewChat = useCallback(() => {
    newChat();
    setMessages([]);
    setInput('');
    setLocalChatId(`qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setMessageProviders({});
  }, [newChat, setMessages]);

  /**
   * Unified send — ALL message sends go through here.
   * Passes provider/model/chatId/sessionId per-request (AI SDK best practice)
   * so values are always current at send time, never stale from a prior render.
   */
  const doSend = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;
    if (!hasAnyProvider) {
      const name = selectedProvider === 'claude' ? 'Claude' : selectedProvider === 'openai' ? 'OpenAI' : 'Gemini';
      setError(`No API key configured for ${name}. Add one in Settings > AI Providers.`);
      return;
    }
    setError(null);
    lastSentProviderRef.current = selectedProvider;
    // Keep the ref in sync so the transport body is current for any
    // automatic follow-up requests (e.g. after tool approval).
    dynamicBodyRef.current = {
      chatId,
      provider: selectedProvider,
      model: selectedModel,
      sessionId: activeSessionId,
    };
    sendMessage(
      { text },
      {
        body: dynamicBodyRef.current,
      }
    );
  }, [isStreaming, hasAnyProvider, selectedProvider, selectedModel, chatId, activeSessionId, sendMessage, setError]);

  // Thin wrappers kept for naming clarity at call sites
  const handleSend = doSend;
  const handleSuggestionClick = useCallback(
    (text: string) => doSend(text),
    [doSend]
  );

  const handlePromptSubmit = useCallback((message: PromptInputMessage) => {
    if (!message.text) return;
    handleSend(message.text);
    setInput('');
    setShowCommandMenu(false);
  }, [handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      setShowCommandMenu(true);
      setCommandMenuIndex(0);
    } else {
      setShowCommandMenu(false);
    }
  }, []);

  const selectCommand = useCallback((cmd: typeof QC_COMMANDS[number]) => {
    setInput(cmd.prompt);
    setShowCommandMenu(false);
    setCommandMenuIndex(0);
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCommandMenu) return;
    const filtered = QC_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0]));
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCommandMenuIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCommandMenuIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCommand(filtered[commandMenuIndex] ?? filtered[0]);
    } else if (e.key === 'Escape') {
      setShowCommandMenu(false);
    }
  }, [showCommandMenu, input, commandMenuIndex, selectCommand]);

  // Auto-send sentinel report prompt when QuickChat opens with one preloaded
  useEffect(() => {
    if (!isOpen || !pendingSentinelPrompt || !hasAnyProvider || isStreaming) return;
    const prompt = pendingSentinelPrompt;
    useQuickChat.setState({ pendingSentinelPrompt: null });
    doSend(prompt);
  }, [isOpen, pendingSentinelPrompt, hasAnyProvider, isStreaming, doSend]);

  // Tool approval handlers
  const handleApprove = useCallback((approvalId: string) => {
    addToolApprovalResponse({ id: approvalId, approved: true });
  }, [addToolApprovalResponse]);

  const handleDeny = useCallback((approvalId: string) => {
    addToolApprovalResponse({ id: approvalId, approved: false });
  }, [addToolApprovalResponse]);

  // Find last assistant message index for streaming indicator
  const lastAssistantIdx = messages.length - 1 -
    [...messages].reverse().findIndex((m) => m.role === 'assistant');

  // Context bar — show repo/branch when a session with git info is active
  const repoName = currentSession?.gitRepo ? extractRepoName(currentSession.gitRepo) : null;
  const branch = gitStatus?.branch;
  const showContextBar = !!activeSessionId && !!(repoName || branch);

  // Slash command menu — filtered by current input prefix
  const filteredCommands = showCommandMenu && input.startsWith('/')
    ? QC_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0]))
    : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeQuickChat}
      />

      {/* Panel */}
      <div ref={panelRef} className="relative flex h-full w-full max-w-lg flex-col bg-background border-l border-border shadow-2xl animate-slide-in-right safe-area-header">
        {/* Header + help popover wrapper */}
        <div className="relative">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {showHistory && (
                <button
                  onClick={() => setShowHistory(false)}
                  className="shrink-0 rounded p-1 hover:bg-primary/10"
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <MessageSquare className="size-4 shrink-0 text-primary" />
              <h2 className="truncate font-display text-sm font-bold uppercase tracking-wider">
                {showHistory ? 'Chat History' : 'Quick Chat'}
              </h2>
              {!showHistory && activeSessionId && (
                <>
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Wrench className="h-2.5 w-2.5" />
                    Agent
                  </span>
                  <EmbeddingStatusBadge sessionId={activeSessionId} />
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!showHistory && (
                <>
                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      showHelp
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                    }`}
                    title="What is Quick Chat?"
                  >
                    ?
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
                    title="Chat history"
                  >
                    History
                  </button>
                  <button
                    onClick={handleNewChat}
                    className="rounded p-1 hover:bg-primary/10"
                    title="New chat"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={closeQuickChat}
                className="rounded p-1 hover:bg-primary/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Help popover */}
          {showHelp && (
            <div
              ref={helpRef}
              className="absolute top-full left-0 right-0 z-50 border-b border-border bg-background shadow-xl p-4"
            >
              <p className="text-xs font-semibold text-foreground mb-2">Quick Chat — Instant AI without a full session</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">-</span>
                  <span><strong className="text-foreground">No session needed</strong> — Claude, Gemini, or OpenAI respond immediately</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">-</span>
                  <span><strong className="text-foreground">Agent mode</strong> — Active when a sandbox session is open. Can read files, search code, run commands, and create GitHub issues.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">-</span>
                  <span><kbd className="rounded border border-border bg-muted/50 px-1 py-px font-mono text-[10px]">Cmd+Shift+C</kbd> — Open/close from anywhere</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">-</span>
                  <span>Type <code className="text-primary">/</code> for quick prompt templates</span>
                </li>
              </ul>
              <button
                onClick={() => {
                  window.location.hash = 'settings/guide';
                  setShowHelp(false);
                  closeQuickChat();
                }}
                className="mt-3 text-[11px] text-primary hover:underline"
              >
                Full Guide →
              </button>
            </div>
          )}
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
            {/* Context bar — repo + branch when session has git info */}
            {showContextBar && (
              <div className="flex items-center gap-2 px-4 py-1 border-b border-border/30 bg-muted/20 text-[10px] text-muted-foreground">
                <GitBranch className="h-3 w-3 shrink-0" />
                {repoName && <span className="font-medium text-foreground/70">{repoName}</span>}
                {branch && <span className="opacity-60">{branch}</span>}
                {currentSession?.projectPath && currentSession.projectPath !== '/workspace' && (
                  <span className="opacity-40 truncate">{currentSession.projectPath}</span>
                )}
              </div>
            )}

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
              <ProviderToggle
                provider="openai"
                selected={selectedProvider === 'openai'}
                available={availableProviders.includes('openai')}
                onClick={() => setProvider('openai')}
                icon={<Bot className="h-3.5 w-3.5" />}
                label="OpenAI"
              />
              <div className="ml-auto">
                <select
                  value={selectedModel || MODEL_OPTIONS[selectedProvider][0]}
                  onChange={(e) => setProvider(selectedProvider, e.target.value)}
                  disabled={!hasAnyProvider}
                  className="rounded-md border border-border/50 bg-muted px-2 py-0.5 text-[11px] text-muted-foreground focus-visible:border-primary focus-visible:outline-none disabled:opacity-40 cursor-pointer"
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
                    {activeSessionId
                      ? 'Agent mode — can read files, search code, and run commands'
                      : 'Instant AI responses — no sandbox required'}
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
                          onClick={handleSuggestionClick}
                        >
                          <s.icon className="mr-1 h-3.5 w-3.5" />
                          {s.label}
                        </Suggestion>
                      ))}
                    </Suggestions>
                  ) : (
                    <div className="text-center px-6">
                      <p className="text-xs text-yellow-400 mb-2">
                        No AI providers configured
                      </p>
                      <p className="text-[10px] leading-relaxed">
                        Add an API key in Settings &gt; AI Providers to enable
                        Quick Chat with Claude, Gemini, or OpenAI.
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
                  provider={messageProviders[msg.id] || selectedProvider}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  onSendMessage={handleSend}
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

            {/* Input — ai-elements PromptInput */}
            <div className="relative">
              {/* Slash command menu */}
              {filteredCommands.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 z-50 overflow-hidden rounded-t-lg border border-border bg-background shadow-xl">
                  {filteredCommands.map((cmd, i) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.cmd}
                        type="button"
                        onClick={() => selectCommand(cmd)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-xs transition-colors ${
                          i === commandMenuIndex
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-primary/10'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-medium text-foreground">{cmd.cmd}</span>
                        <span className="truncate opacity-60">— {cmd.prompt.slice(0, 50)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            <PromptInput
              onSubmit={handlePromptSubmit}
              className="border-t border-border px-4 py-3"
            >
              <PromptInputBody>
                <div className="flex items-end gap-2">
                  <PromptInputTextarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder={
                      hasAnyProvider
                        ? 'Ask anything...'
                        : 'Configure a provider in Settings first'
                    }
                    disabled={isStreaming || !hasAnyProvider}
                    className="flex-1 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm"
                  />
                  <QCSpeechButton onTranscript={(t) => setInput((prev) => prev ? `${prev} ${t}` : t)} />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stop}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
                      title="Stop generating"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || !hasAnyProvider}
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all',
                        input.trim()
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground/40',
                      )}
                      title="Send message"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </PromptInputBody>
            </PromptInput>
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
            : 'text-muted-foreground hover:text-foreground hover:bg-primary/10 border border-transparent'
      }`}
    >
      {icon}
      {label}
      {!available && (
        <span className="text-[10px] opacity-60">n/a</span>
      )}
    </button>
  );
}

/** Parse semanticSearch tool output into SourceFile[] for the Sources component */
function extractSourcesFromParts(parts: UIMessage['parts']): SourceFile[] {
  const sources: SourceFile[] = [];
  for (const part of parts) {
    if (part.type !== 'dynamic-tool') continue;
    const toolPart = part as DynamicToolUIPart;
    if (toolPart.toolName !== 'semanticSearch') continue;
    if (toolPart.state !== 'output-available') continue;
    if (!('output' in toolPart) || typeof toolPart.output !== 'string') continue;

    // Parse lines like: [87%] /workspace/src/auth.ts
    const lines = (toolPart.output as string).split('\n');
    for (const line of lines) {
      const match = line.match(/^\[(\d+)%\]\s+(.+)$/);
      if (match) {
        sources.push({
          path: match[2].trim(),
          score: parseInt(match[1], 10) / 100,
        });
      }
    }
  }
  return sources;
}

/**
 * Wrapper that feeds Streamdown progressively via useSmoothText.
 * Prevents React 18 batching and Chrome Fetch buffering from causing pop-in:
 * even if all tokens arrive in one render cycle, the rAF loop drips them out.
 */
function StreamingTextPart({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const smooth = useSmoothText(text, isStreaming);
  const animating = smooth.length < text.length;
  return (
    <MessageResponse mode={isStreaming || animating ? 'streaming' : 'static'}>
      {smooth}
    </MessageResponse>
  );
}

function QuickChatMessage({
  msg,
  isLastAssistant,
  isStreaming,
  provider,
  onApprove,
  onDeny,
  onSendMessage,
}: {
  msg: UIMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  provider: ProviderName;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onSendMessage: (text: string) => void;
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

  const textContent = getMessageText(msg);
  const activelyStreaming = isLastAssistant && isStreaming;
  const hasToolParts = msg.parts.some(
    (p) =>
      p.type === 'dynamic-tool' ||
      p.type === 'reasoning' ||
      (typeof p.type === 'string' && p.type.startsWith('tool-'))
  );

  // Simple path: no tool/reasoning parts — render as before
  if (!hasToolParts) {
    return (
      <div className="group/message space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
            AI
          </span>
          <ProviderBadge provider={provider} />
        </div>
        <div className="rounded-lg border-l-2 border-secondary/20 bg-muted px-3 py-2 text-sm">
          <StreamingTextPart text={textContent} isStreaming={activelyStreaming} />
        </div>
        {!isStreaming && <MessageActions content={textContent} />}
      </div>
    );
  }

  // Rich path: iterate parts for tool calls, reasoning, and text
  const sources = extractSourcesFromParts(msg.parts);

  const handleSourceClick = (path: string) => {
    useSandboxStore.getState().openFile(path);
  };

  return (
    <div className="group/message space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
          AI
        </span>
        <ProviderBadge provider={provider} />
      </div>

      {msg.parts.map((part, i) => {
        if (part.type === 'text' && 'text' in part) {
          const text = (part as { type: 'text'; text: string }).text;
          if (!text.trim()) return null;
          return (
            <div key={i} className="rounded-lg border-l-2 border-secondary/20 bg-muted px-3 py-2 text-sm">
              <StreamingTextPart text={text} isStreaming={activelyStreaming} />
            </div>
          );
        }

        if (part.type === 'reasoning' && 'text' in part) {
          return (
            <Reasoning key={i} isStreaming={isLastAssistant && isStreaming}>
              <ReasoningTrigger className="text-xs text-muted-foreground">
                Thinking...
              </ReasoningTrigger>
              <ReasoningContent className="mt-2 text-xs">
                {(part as { type: 'reasoning'; text: string }).text}
              </ReasoningContent>
            </Reasoning>
          );
        }

        if (part.type === 'dynamic-tool') {
          const toolPart = part as DynamicToolUIPart;

          if (toolPart.state === 'approval-requested') {
            return (
              <Confirmation
                key={toolPart.toolCallId}
                toolName={toolPart.toolName}
                input={toolPart.input}
                approvalId={toolPart.approval.id}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            );
          }

          if (
            toolPart.toolName === 'create_plan' &&
            (toolPart.state === 'output-available' || toolPart.state === 'input-available')
          ) {
            const planInput = toolPart.input as {
              title: string;
              steps: Array<{ id: string; label: string; detail?: string }>;
              estimatedSteps?: number;
            };
            return (
              <PlanCard
                key={toolPart.toolCallId}
                title={planInput.title}
                steps={planInput.steps}
                estimatedSteps={planInput.estimatedSteps}
              />
            );
          }

          if (
            toolPart.toolName === 'ask_user_questions' &&
            (toolPart.state === 'output-available' || toolPart.state === 'input-available')
          ) {
            const input = toolPart.input as {
              title?: string;
              questions: Array<{
                id: string;
                question: string;
                type: 'text' | 'select' | 'multiselect' | 'confirm';
                options?: string[];
                placeholder?: string;
                required?: boolean;
              }>;
            };
            return (
              <QuestionFlow
                key={toolPart.toolCallId}
                title={input.title}
                questions={input.questions}
                onSubmit={onSendMessage}
              />
            );
          }

          {
            const rawOutput = 'output' in toolPart ? toolPart.output : undefined;
            const rawError = 'errorText' in toolPart ? toolPart.errorText : undefined;
            const toolOutput = typeof rawOutput === 'string' ? rawOutput : undefined;
            const toolError = typeof rawError === 'string' ? rawError : undefined;
            return (
              <Tool
                key={toolPart.toolCallId}
                name={toolPart.toolName}
                state={toolPart.state as 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'output-denied' | 'approval-responded'}
                input={toolPart.input as Record<string, unknown>}
                compact
              >
                <ToolHeader />
                <ToolCitation output={toolOutput} />
                <ToolContent>
                  <ToolSchemaInput />
                  <ToolOutput output={toolOutput} errorText={toolError} />
                </ToolContent>
              </Tool>
            );
          }
        }

        // Static tool parts (e.g. needsApproval tools): type is 'tool-{name}'
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolName = part.type.slice(5); // 'tool-runCommand' → 'runCommand'
          const sp = part as {
            type: string;
            toolCallId: string;
            state: string;
            input?: unknown;
            approval?: { id: string };
            output?: unknown;
            errorText?: string;
          };
          if (sp.state === 'approval-requested' && sp.approval) {
            return (
              <Confirmation
                key={sp.toolCallId}
                toolName={toolName}
                input={sp.input as Record<string, unknown>}
                approvalId={sp.approval.id}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            );
          }
          const spOutput = typeof sp.output === 'string' ? sp.output : undefined;
          const spError = typeof sp.errorText === 'string' ? sp.errorText : undefined;
          return (
            <Tool
              key={sp.toolCallId}
              name={toolName}
              state={sp.state as 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'output-denied' | 'approval-responded'}
              input={sp.input as Record<string, unknown>}
              compact
            >
              <ToolHeader />
              <ToolContent>
                <ToolSchemaInput />
                <ToolOutput output={spOutput} errorText={spError} />
              </ToolContent>
            </Tool>
          );
        }

        return null;
      })}

      {sources.length > 0 && (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => handleSourceClick(s.path)}
                className="flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <span className="font-medium">{s.path}</span>
                {s.score != null && (
                  <span className="text-muted-foreground">{Math.round(s.score * 100)}%</span>
                )}
              </button>
            ))}
          </SourcesContent>
        </Sources>
      )}

      {!isStreaming && textContent && (
        <MessageActions content={textContent} />
      )}
    </div>
  );
}

function ProviderBadge({ provider }: { provider: ProviderName }) {
  const style =
    provider === 'claude'
      ? 'bg-orange-500/10 text-orange-400'
      : provider === 'openai'
        ? 'bg-green-500/10 text-green-400'
        : 'bg-blue-500/10 text-blue-400';
  const icon =
    provider === 'claude' ? (
      <Crown className="h-2.5 w-2.5" />
    ) : provider === 'openai' ? (
      <Bot className="h-2.5 w-2.5" />
    ) : (
      <Sparkles className="h-2.5 w-2.5" />
    );
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium ${style}`}
    >
      {icon}
      {provider}
    </span>
  );
}

function EmbeddingStatusBadge({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<{
    indexed: boolean;
    fileCount: number;
    indexing: boolean;
  }>({ indexed: false, fileCount: 0, indexing: false });
  const [reindexing, setReindexing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await embeddingsApi.status(sessionId);
      if (res.success && res.data) {
        setStatus(res.data);
      }
    } catch {
      // Silent — badge just won't show
    }
  }, [sessionId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    try {
      await embeddingsApi.index(sessionId);
      await fetchStatus();
    } catch {
      // Silent
    } finally {
      setReindexing(false);
    }
  }, [sessionId, fetchStatus]);

  if (status.indexing || reindexing) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Indexing...
      </span>
    );
  }

  if (status.indexed) {
    return (
      <button
        type="button"
        onClick={handleReindex}
        title="Re-index workspace"
        className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
      >
        <Database className="h-2.5 w-2.5" />
        {status.fileCount} files
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleReindex}
      title="Index workspace for semantic search"
      className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-primary/10/80 transition-colors"
    >
      <RefreshCw className="h-2.5 w-2.5" />
      Index
    </button>
  );
}

// Standalone speech button — no context dependency
const SpeechRecognitionApi: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

function QCSpeechButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => () => { recRef.current?.abort(); }, []);

  if (!SpeechRecognitionApi) return null;

  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const r = new SpeechRecognitionApi();
    r.continuous = false; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript; if (t) onTranscript(t); };
    r.onend = () => { setListening(false); recRef.current = null; };
    r.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = r; r.start(); setListening(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        listening ? 'text-red-400 bg-red-500/10' : 'text-muted-foreground/60 hover:bg-primary/10 hover:text-muted-foreground',
      )}
      title={listening ? 'Stop listening' : 'Voice input'}
    >
      <Mic className="h-4 w-4" />
      {listening && <span className="absolute inset-0 animate-ping rounded-lg border border-red-400/40" />}
    </button>
  );
}
