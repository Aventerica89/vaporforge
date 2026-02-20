import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { Trash2, Loader2, ArrowDown, Paperclip, Code, Bug, TestTube, Lightbulb, BrainCircuit } from 'lucide-react';
import { useSandboxStore, useMessage, useMessageIds, useMessageCount } from '@/hooks/useSandbox';
import { TokenCounter } from '@/components/elements/TokenCounter';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { chatApi, filesApi } from '@/lib/api';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDebugLog } from '@/hooks/useDebugLog';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import { MessageActions } from '@/components/chat/MessageActions';
import { StreamingIndicator } from '@/components/chat/StreamingIndicator';
import { TypingCursor } from '@/components/chat/TypingCursor';
import {
  Message,
  MessageBubble,
  MessageBody,
  MessageFooter,
  MessageAttachments,
} from '@/components/chat/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputTools,
  PromptInputHint,
  PromptInputActions,
  PromptInputSpeech,
  PromptInputSlashMenu,
  PromptInputReforge,
  PromptInputModeToggle,
  PromptInputAttachments,
} from '@/components/prompt-input';
import type { Message as MessageType, ImageAttachment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Welcome state suggestion chips
// ---------------------------------------------------------------------------

const WELCOME_SUGGESTIONS = [
  { icon: Code, text: 'Explain this codebase' },
  { icon: Bug, text: 'Help me fix a bug' },
  { icon: TestTube, text: 'Write tests for my code' },
  { icon: Lightbulb, text: 'Suggest improvements' },
] as const;

// ---------------------------------------------------------------------------
// MemoizedMessageItem — selects its own message by ID, skips re-render when
// the message object hasn't changed (reference equality from the map).
// ---------------------------------------------------------------------------

const MemoizedMessageItem = memo(function MessageItem({ id }: { id: string }) {
  const message = useMessage(id);
  if (!message) return null;

  return (
    <Message role={message.role}>
      {message.role === 'user' ? (
        <MessageBubble>
          <MessageAttachments message={message} />
        </MessageBubble>
      ) : (
        <MessageBody>
          <MessageContent message={message} />
          <MessageFooter timestamp={message.timestamp}>
            <MessageActions content={message.content} messageId={message.id} />
            {message.usage && (
              <span className="ml-auto text-[9px] tabular-nums text-muted-foreground/50" title="Token usage: input / output">
                {message.usage.inputTokens.toLocaleString()}↑ {message.usage.outputTokens.toLocaleString()}↓
                {message.usage.costUsd !== undefined && (
                  <> · ${message.usage.costUsd < 0.001 ? message.usage.costUsd.toFixed(5) : message.usage.costUsd.toFixed(4)}</>
                )}
              </span>
            )}
          </MessageFooter>
        </MessageBody>
      )}
    </Message>
  );
});

// ---------------------------------------------------------------------------
// StreamingMessage — isolated component that subscribes ONLY to streaming state.
// Prevents the message list from re-rendering on every streaming chunk.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CompactionBanner — shown while Claude auto-compacts its context window
// ---------------------------------------------------------------------------

function CompactionBanner() {
  const isCompacting = useSandboxStore((s) => s.isCompacting);
  if (!isCompacting) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/80">
      <BrainCircuit className="h-3.5 w-3.5 shrink-0 animate-pulse" />
      <span>Compacting context — Claude is condensing the conversation to free up memory...</span>
    </div>
  );
}

function StreamingMessage() {
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const streamingContent = useSandboxStore((s) => s.streamingContent);
  const streamingParts = useSandboxStore((s) => s.streamingParts);
  const stopStreaming = useSandboxStore((s) => s.stopStreaming);

  if (!isStreaming) return null;

  return (
    <Message role="assistant" isStreaming>
      <MessageBody>
        {streamingContent || streamingParts.length > 0 ? (
          <>
            <StreamingContent
              parts={streamingParts}
              fallbackContent={streamingContent}
            />
            <TypingCursor />
          </>
        ) : (
          <StreamingIndicator
            parts={streamingParts}
            hasContent={false}
          />
        )}
        <MessageFooter>
          <MessageActions
            content={streamingContent}
            isStreaming
            onStop={stopStreaming}
          />
        </MessageFooter>
      </MessageBody>
    </Message>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector — three pills for Sonnet / Haiku / Opus selection
// ---------------------------------------------------------------------------

const MODEL_OPTIONS = [
  { key: 'auto',   label: 'A', title: 'Auto — best model for the task (default)' },
  { key: 'sonnet', label: 'S', title: 'Claude Sonnet 4.6' },
  { key: 'haiku',  label: 'H', title: 'Claude Haiku (fast, lightweight)' },
  { key: 'opus',   label: 'O', title: 'Claude Opus (most capable)' },
] as const;

function ModelSelector({
  selected,
  onSelect,
}: {
  selected: 'auto' | 'sonnet' | 'haiku' | 'opus';
  onSelect: (m: 'auto' | 'sonnet' | 'haiku' | 'opus') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/20 p-0.5">
      {MODEL_OPTIONS.map(({ key, label, title }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          title={title}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono transition-colors ${
            selected === key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// AutonomySelector — three pills for permission mode selection
// ---------------------------------------------------------------------------

const AUTONOMY_OPTIONS = [
  { key: 'conservative', label: 'C', title: 'Conservative — Claude asks before making changes' },
  { key: 'standard',     label: 'S', title: 'Standard — Claude accepts edits automatically' },
  { key: 'autonomous',   label: 'A', title: 'Autonomous — Full bypass, no confirmation prompts' },
] as const;

function AutonomySelector({
  selected,
  onSelect,
}: {
  selected: 'conservative' | 'standard' | 'autonomous';
  onSelect: (m: 'conservative' | 'standard' | 'autonomous') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/20 p-0.5">
      {AUTONOMY_OPTIONS.map(({ key, label, title }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          title={title}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono transition-colors ${
            selected === key
              ? 'bg-amber-500/80 text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  /** Hide the header bar — used on mobile where MobileLayout provides chrome */
  compact?: boolean;
  /** Primary workspace mode — hides internal header (chat IS the main area) */
  primary?: boolean;
}

export function ChatPanel({ compact = false, primary = false }: ChatPanelProps) {
  // Granular selectors — each subscribes only to the slice it needs
  const messageIds = useMessageIds();
  const messageCount = useMessageCount();
  const sendMessage = useSandboxStore((s) => s.sendMessage);
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const stopStreaming = useSandboxStore((s) => s.stopStreaming);
  const clearMessages = useSandboxStore((s) => s.clearMessages);
  const currentFile = useSandboxStore((s) => s.currentFile);
  const sdkMode = useSandboxStore((s) => s.sdkMode);
  const setMode = useSandboxStore((s) => s.setMode);
  const selectedModel = useSandboxStore((s) => s.selectedModel);
  const setModel = useSandboxStore((s) => s.setModel);
  const autonomyMode = useSandboxStore((s) => s.autonomyMode);
  const setAutonomy = useSandboxStore((s) => s.setAutonomy);
  const sessionId = useSandboxStore((s) => s.currentSession?.id);
  const messagesById = useSandboxStore((s) => s.messagesById);

  // Rough token estimate: total chars ÷ 4 (industry standard approximation)
  const estimatedTokens = useMemo(() => {
    let chars = 0;
    for (const msg of Object.values(messagesById)) {
      chars += msg.content?.length ?? 0;
    }
    return Math.floor(chars / 4);
  }, [messagesById]);

  // Session cost total — sum of costUsd across all assistant messages
  const sessionCostUsd = useMemo(() => {
    let total = 0;
    let hasAny = false;
    for (const msg of Object.values(messagesById)) {
      if (msg.usage?.costUsd !== undefined) {
        total += msg.usage.costUsd;
        hasAny = true;
      }
    }
    return hasAny ? total : undefined;
  }, [messagesById]);
  // For auto-scroll: subscribe to streamingContent length, not full content
  const hasStreamingContent = useSandboxStore((s) => s.streamingContent.length > 0);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isVisible: keyboardOpen } = useKeyboard();

  // Auto-scroll to bottom on new messages or streaming progress
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount, hasStreamingContent]);

  // Auto-scroll when keyboard opens
  useEffect(() => {
    if (keyboardOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [keyboardOpen]);

  // Pull-to-refresh: reload chat history from server (mobile only)
  const currentSessionId = useSandboxStore((s) => s.currentSession?.id);

  const handleRefresh = useCallback(async () => {
    if (!currentSessionId) return;
    const result = await chatApi.history(currentSessionId);
    if (result.success && result.data) {
      const byId: Record<string, MessageType> = {};
      const ids: string[] = [];
      for (const msg of result.data) {
        byId[msg.id] = msg;
        ids.push(msg.id);
      }
      useSandboxStore.setState({ messagesById: byId, messageIds: ids });
    }
  }, [currentSessionId]);

  const { pullDistance, isRefreshing, handlers: pullHandlers } =
    usePullToRefresh({
      onRefresh: handleRefresh,
      disabled: !compact,
    });

  // Image upload function — uploads to sandbox, returns attachment with uploadedPath
  const uploadImage = useCallback(
    async (img: ImageAttachment): Promise<ImageAttachment | null> => {
      if (!sessionId) return null;
      try {
        const result = await filesApi.uploadBase64(
          sessionId,
          img.filename,
          img.dataUrl,
        );
        if (result.success && result.data) {
          return { ...img, uploadedPath: result.data.path };
        }
      } catch (err) {
        useDebugLog.getState().addEntry({
          category: 'api',
          level: 'error',
          summary: `Image upload failed: ${img.filename}`,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    },
    [sessionId],
  );

  const isEmpty = messageCount === 0 && !isStreaming;

  // Shared prompt input — extracted so it can be placed at center or bottom
  const promptInput = (
    <PromptInput
      input={input}
      onInputChange={setInput}
      onSubmit={sendMessage}
      onStop={stopStreaming}
      status={isStreaming ? 'streaming' : 'idle'}
      uploadImage={uploadImage}
      compact={compact}
      keyboardOpen={keyboardOpen}
      disabled={!sessionId}
    >
      <PromptInputTools>
        {currentFile && (
          <>
            <Paperclip className="h-3 w-3 text-muted-foreground/60" />
            <span className="rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              {currentFile.name}
            </span>
          </>
        )}
        <PromptInputReforge />
        <PromptInputModeToggle mode={sdkMode} onModeChange={setMode} />
        <ModelSelector selected={selectedModel} onSelect={setModel} />
        <AutonomySelector selected={autonomyMode} onSelect={setAutonomy} />
        {estimatedTokens > 0 && (
          <TokenCounter tokens={estimatedTokens} />
        )}
      </PromptInputTools>
      <PromptInputSlashMenu />
      <div className={cn(
        'relative rounded-xl border transition-all duration-300',
        'bg-background',
        input.trim().length > 0
          ? 'border-purple-500/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.35)]'
          : 'border-primary/50 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.25)] hover:border-primary/70 hover:shadow-[0_0_20px_-4px_hsl(var(--primary)/0.35)]',
      )}>
        <PromptInputAttachments />
        <PromptInputTextarea
          placeholder={
            sdkMode === 'plan'
              ? 'Research mode — Claude can read but not edit...'
              : 'Describe the task... (use @ to mention files, / for commands)'
          }
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <PromptInputActions />
          <PromptInputSpeech />
          <PromptInputSubmit />
        </div>
      </div>
      <PromptInputHint />
    </PromptInput>
  );

  return (
    <div className={`flex h-full flex-col bg-card ${compact || primary ? '' : 'border-l border-border/60'}`}>
      {/* Header — hidden in compact (mobile) or primary (center workspace) mode */}
      {!compact && !primary && !isEmpty && (
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chat
            </span>
            {currentFile && (
              <span className="text-xs text-primary/60">
                — {currentFile.name}
              </span>
            )}
            {sessionCostUsd !== undefined && (
              <span
                className="text-[10px] tabular-nums text-muted-foreground/50"
                title="Session cost (your Anthropic account)"
              >
                ${sessionCostUsd < 0.01 ? sessionCostUsd.toFixed(4) : sessionCostUsd.toFixed(3)} session
              </span>
            )}
          </div>
          <button
            onClick={clearMessages}
            className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            title="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {isEmpty ? (
        /* ── WELCOME STATE: centered headline + input ── */
        <div className="flex h-full flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl space-y-5">
            <div className="text-center">
              <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
                What do you want to build?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Describe a task — Claude will get to work in your sandbox
              </p>
            </div>
            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {WELCOME_SUGGESTIONS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  disabled={!sessionId}
                  className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icon className="h-3 w-3" />
                  {text}
                </button>
              ))}
            </div>
            {promptInput}
          </div>
        </div>
      ) : (
        /* ── CHAT STATE: messages list + input at bottom ── */
        <>
          {compact && messageCount > 0 && (
            <div className="flex justify-end px-3 pt-2">
              <button
                onClick={clearMessages}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                title="Clear chat"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            {...(compact ? pullHandlers : {})}
          >
            {/* Pull-to-refresh indicator (mobile only) */}
            {compact && (pullDistance > 0 || isRefreshing) && (
              <div
                className="flex items-center justify-center transition-all"
                style={{
                  height: isRefreshing ? 40 : Math.min(pullDistance, 80),
                  opacity: isRefreshing ? 1 : Math.min(pullDistance / 80, 1),
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <ArrowDown
                    className="h-5 w-5 text-muted-foreground transition-transform"
                    style={{
                      transform: pullDistance >= 80 ? 'rotate(180deg)' : 'none',
                    }}
                  />
                )}
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-1">
              {messageIds.map((id) => (
                <MemoizedMessageItem key={id} id={id} />
              ))}
              <CompactionBanner />
              <StreamingMessage />
              <div ref={messagesEndRef} />
            </div>
          </div>

          {promptInput}
        </>
      )}
    </div>
  );
}
