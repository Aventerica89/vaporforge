import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import {
  Trash2, Paperclip, BrainCircuit, X,
  Flame, Eye, Zap, Bookmark, MoreHorizontal, ChevronDown, Check,
} from 'lucide-react';
import { useSandboxStore, useMessage, useMessageIds, useMessageCount } from '@/hooks/useSandbox';
import { filesApi } from '@/lib/api';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDebugLog } from '@/hooks/useDebugLog';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import {
  Message as AIMessage,
  MessageContent as AIMessageContent,
} from '@/components/ai-elements/message';
import { ThinkingBar } from '@/components/prompt-kit/thinking-bar';

import { AutonomySelectorPopup } from '@/components/prompt-input/AutonomySelectorPopup';
import { PromptMoreDrawer } from '@/components/mobile/PromptMoreDrawer';
import type { MobileTab } from '@/components/mobile/MobileTabBar';
import type { SubView } from '@/hooks/useMobileNav';
import { MessageActions } from '@/components/chat/MessageActions';
import { StreamingIndicator } from '@/components/chat/StreamingIndicator';
import { TypingCursor } from '@/components/chat/TypingCursor';
import { ReforgeModal } from '@/components/chat/ReforgeModal';
import { BorderTrail } from '@/components/motion-primitives/border-trail';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
} from '@/components/ai-elements/context';
import { SessionIsland } from '@/components/playground/SessionIsland';
import { useReforge } from '@/hooks/useReforge';
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
  PromptInputSlashMenu,
  PromptInputAttachments,
} from '@/components/prompt-input';
import { FeedbackBar } from '@/components/prompt-kit/feedback-bar';
import type { ImageAttachment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Agent options — model selector dropdown
// ---------------------------------------------------------------------------

const AGENT_OPTIONS = [
  { id: 'auto',   label: 'Auto',       description: 'Best model for each task (default)' },
  { id: 'opus',   label: 'Opus 4.6',   description: 'Most capable — complex reasoning' },
  { id: 'sonnet', label: 'Sonnet 4.6', description: 'Balanced — fast and highly capable' },
  { id: 'haiku',  label: 'Haiku 4.5',  description: 'Fastest — lightweight tasks' },
] as const;

const GRID_BG = [
  'before:absolute before:inset-0 before:pointer-events-none before:z-0',
  'before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)]',
  'before:bg-[size:24px_24px]',
  'before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]',
  '[&>*]:relative [&>*]:z-10',
].join(' ');

// ---------------------------------------------------------------------------
// MemoizedMessageItem
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
// MobileMemoizedMessageItem — ai-elements Message (no avatar, no footer)
// ---------------------------------------------------------------------------

const MobileMemoizedMessageItem = memo(function MobileMessageItem({ id }: { id: string }) {
  const message = useMessage(id);
  if (!message) return null;

  return (
    <AIMessage from={message.role}>
      {message.role === 'user' ? (
        <AIMessageContent className="group-[.is-user]:bg-primary">
          <MessageAttachments message={message} />
        </AIMessageContent>
      ) : (
        <AIMessageContent>
          <MessageContent message={message} />
        </AIMessageContent>
      )}
    </AIMessage>
  );
});

// ---------------------------------------------------------------------------
// CompactionBanner
// ---------------------------------------------------------------------------

function CompactionBanner() {
  const isCompacting = useSandboxStore((s) => s.isCompacting);
  const compactionDone = useSandboxStore((s) => s.compactionDone);
  const dismissCompactionDone = useSandboxStore((s) => s.dismissCompactionDone);

  useEffect(() => {
    if (!compactionDone) return;
    const timer = setTimeout(() => dismissCompactionDone(), 4000);
    return () => clearTimeout(timer);
  }, [compactionDone, dismissCompactionDone]);

  if (isCompacting) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/80">
        <BrainCircuit className="h-3.5 w-3.5 shrink-0 animate-pulse" />
        <span>Compacting context — Claude is condensing the conversation to free up memory...</span>
      </div>
    );
  }

  if (compactionDone) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400/80">
        <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
        <span>Context compacted — session summary saved</span>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// FeedbackPrompt
// ---------------------------------------------------------------------------

function FeedbackPrompt() {
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const messageCount = useSandboxStore((s) => s.messageIds.length);
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const prevStreamingRef = useRef(false);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && messageCount > 0) {
      setVisible(true);
      setSubmitted(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, messageCount]);

  if (!visible || submitted) return null;

  const handleFeedback = () => {
    setSubmitted(true);
    setTimeout(() => setVisible(false), 600);
  };

  return (
    <div className="mt-3 px-1">
      <FeedbackBar
        title="Was this response helpful?"
        onHelpful={handleFeedback}
        onNotHelpful={handleFeedback}
        onClose={() => setVisible(false)}
      />
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
// MobileStreamingMessage — ai-elements Message (no avatar, ThinkingBar when empty)
// ---------------------------------------------------------------------------

function MobileStreamingMessage() {
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const streamingContent = useSandboxStore((s) => s.streamingContent);
  const streamingParts = useSandboxStore((s) => s.streamingParts);
  const stopStreaming = useSandboxStore((s) => s.stopStreaming);

  if (!isStreaming) return null;

  return (
    <AIMessage from="assistant">
      <AIMessageContent>
        {streamingContent || streamingParts.length > 0 ? (
          <StreamingContent
            parts={streamingParts}
            fallbackContent={streamingContent}
          />
        ) : (
          <ThinkingBar
            text="Claude is thinking..."
            onStop={stopStreaming}
            stopLabel="Stop"
          />
        )}
      </AIMessageContent>
    </AIMessage>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  compact?: boolean;
  primary?: boolean;
  onMobileTabChange?: (tab: MobileTab) => void;
  onMobileNavigate?: (view: SubView) => void;
}

export function ChatPanel({
  compact = false,
  primary = false,
  onMobileTabChange,
  onMobileNavigate,
}: ChatPanelProps) {
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
  const sessionSummary = useSandboxStore((s) => s.sessionSummary);

  const estimatedTokens = useMemo(() => {
    let chars = 0;
    for (const msg of Object.values(messagesById)) {
      chars += msg.content?.length ?? 0;
    }
    return Math.floor(chars / 4);
  }, [messagesById]);

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

  const hasStreamingContent = useSandboxStore((s) => s.streamingContent.length > 0);

  const [input, setInput] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentRef = useRef<HTMLDivElement>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isVisible: keyboardOpen } = useKeyboard();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount, hasStreamingContent]);

  useEffect(() => {
    if (!agentOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(e.target as Node)) {
        setAgentOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agentOpen]);

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

  // ---------------------------------------------------------------------------
  // Prompt input — rounded-3xl with BorderTrail + mobile action bar
  // ---------------------------------------------------------------------------

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
      className={cn(
        'relative z-10 w-full rounded-3xl border bg-card/90 pt-1 backdrop-blur-md !px-0 !pb-0',
        isStreaming || input.trim().length > 0
          ? 'border-purple-500/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.35)]'
          : 'border-primary/50 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.25)] hover:border-primary/70 hover:shadow-[0_0_20px_-4px_hsl(var(--primary)/0.35)]',
      )}
    >
      <AnimatePresence>
        {isStreaming && (
          <motion.div
            key="border-trail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <BorderTrail
              size={120}
              radius={24}
              className="bg-gradient-to-l from-purple-400/0 via-purple-400 to-purple-400/0"
              transition={{ ease: 'linear', duration: 3, repeat: Infinity }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <PromptInputSlashMenu />
      <PromptInputAttachments />
      <PromptInputTextarea
        placeholder="Ask anything..."
        className="min-h-[44px] pl-4 pt-3 text-base leading-[1.3]"
      />
      {/* Mobile action bar (hidden on desktop) */}
      <div className="flex md:hidden items-center justify-between px-1 pt-1 pb-2">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => useReforge.getState().open()}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground active:scale-95 transition-colors"
          >
            <Flame className="size-5 text-primary/70" />
          </button>
          <button
            type="button"
            onClick={() => setMode(sdkMode === 'plan' ? 'agent' : 'plan')}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg transition-colors active:scale-95',
              sdkMode === 'plan'
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
            )}
          >
            {sdkMode === 'plan' ? <Eye className="size-5" /> : <Zap className="size-5" />}
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground active:scale-95 transition-colors"
          >
            <Paperclip className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setSessionOpen((v) => !v)}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg transition-colors active:scale-95',
              sessionOpen
                ? 'text-purple-400 bg-purple-500/10'
                : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
            )}
          >
            <Bookmark className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setMoreDrawerOpen(true)}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground active:scale-95 transition-colors"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>
        <div className="pr-2">
          <PromptInputSubmit />
        </div>
      </div>
      {/* Desktop submit row */}
      <div className="hidden md:flex justify-end px-2 pb-2">
        <PromptInputSubmit />
      </div>
    </PromptInput>
  );

  // ---------------------------------------------------------------------------
  // SessionIsland — shared across welcome + chat states for layoutId animation
  // ---------------------------------------------------------------------------

  const sessionIsland = (
    <SessionIsland
      status={isStreaming ? 'streaming' : 'idle'}
      controlsOpen={sessionOpen}
      onNew={clearMessages}
      onPause={stopStreaming}
      onResume={() => {}}
      onStop={stopStreaming}
    />
  );

  // ---------------------------------------------------------------------------
  // Pills row — Reforge / mode / Session / Model / Autonomy / Context
  // ---------------------------------------------------------------------------

  const pillsRow = (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      <div className="hidden md:contents">
        <button
          type="button"
          onClick={() => useReforge.getState().open()}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Flame className="h-3 w-3" />
          Reforge
        </button>
        <button
          type="button"
          onClick={() => setMode(sdkMode === 'plan' ? 'agent' : 'plan')}
          className={cn(
            'flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium transition-colors',
            sdkMode === 'plan'
              ? 'bg-primary/15 text-primary'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          <Zap className="h-3 w-3" />
          {sdkMode === 'plan' ? 'Plan mode' : 'Auto-pick'}
        </button>
        <button
          type="button"
          onClick={() => setSessionOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            sessionOpen
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
          )}
        >
          <Bookmark className="h-3 w-3" />
          <span>Session</span>
        </button>
      </div>

      {/* Model dropdown */}
      <div ref={agentRef} className="relative">
        <button
          type="button"
          onClick={() => setAgentOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            agentOpen
              ? 'bg-primary/15 text-primary'
              : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
          )}
        >
          <Zap className="h-3 w-3" />
          <span>{AGENT_OPTIONS.find((a) => a.id === selectedModel)?.label ?? 'Auto'}</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', agentOpen && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {agentOpen && (
            <motion.div
              key="agent-dropdown"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full mb-1.5 left-0 z-50 w-52 rounded-xl border border-primary/50 bg-background overflow-hidden"
            >
              <div className={cn('relative', GRID_BG)}>
                <div className="p-1">
                  {AGENT_OPTIONS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => { setModel(agent.id); setAgentOpen(false); }}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                        selectedModel === agent.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium">{agent.label}</span>
                        <span className="text-[10px] text-muted-foreground">{agent.description}</span>
                      </div>
                      {selectedModel === agent.id && (
                        <Check className="ml-auto h-3 w-3 shrink-0 mt-0.5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AutonomySelectorPopup selected={autonomyMode} onSelect={setAutonomy} />

      <div className="ml-auto">
        <Context usedTokens={estimatedTokens} maxTokens={200000}>
          <ContextTrigger className="h-auto rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground" />
          <ContextContent
            side="top"
            align="start"
            className={cn('relative border-primary/50 bg-background overflow-hidden', GRID_BG)}
          >
            <ContextContentHeader />
            <ContextContentBody className="space-y-1.5">
              <ContextInputUsage />
              <ContextOutputUsage />
            </ContextContentBody>
            {sessionSummary && (
              <ContextContentBody className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Session summary
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/80 line-clamp-6">
                  {sessionSummary}
                </p>
              </ContextContentBody>
            )}
            <ContextContentFooter />
          </ContextContent>
        </Context>
      </div>
    </div>
  );

  return (
    <div className={`flex h-full flex-col bg-background ${compact || primary ? '' : 'border-l border-border/60'}`}>
      {/* Header — hidden in compact/primary/welcome mode */}
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
          {confirmingClear ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { clearMessages(); setConfirmingClear(false); }}
                className="rounded px-2 py-1 text-xs font-semibold text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setConfirmingClear(false)}
                className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-accent transition-colors"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingClear(true)}
              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {isEmpty ? (
        /* Welcome state — SessionIsland + headline + input + pills */
        <div className="relative flex h-full flex-col items-center px-4 pb-4 md:justify-center">
          {/* Grid background — matches PlaygroundPage */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
          <div className="flex flex-1 md:flex-none min-h-0 flex-col items-center justify-center overflow-y-auto w-full">
            <div className="w-full max-w-2xl space-y-5 flex flex-col items-center">
              <div className="text-center">
                <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
                  What do you want to build?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Describe a task — Claude will get to work in your sandbox
                </p>
              </div>
              <motion.div
                layoutId="session-island"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              >
                {sessionIsland}
              </motion.div>
            </div>
          </div>
          <div className="w-full max-w-2xl flex flex-col gap-2 md:mt-5">
            <div className="order-2 md:order-1">{promptInput}</div>
            <div className="order-1 md:order-2">{pillsRow}</div>
          </div>
        </div>
      ) : (
        /* Chat state — messages + input + pills at bottom */
        <>
          {compact ? (
            /* Mobile: plain scroll div — respects visualViewport from MobileLayout */
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 px-4 py-3">
                {messageIds.map((id) => (
                  <MobileMemoizedMessageItem key={id} id={id} />
                ))}
                <CompactionBanner />
                <MobileStreamingMessage />
                <FeedbackPrompt />
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            /* Desktop: existing rendering (unchanged) */
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="mx-auto max-w-3xl space-y-1">
                {messageIds.map((id) => (
                  <MemoizedMessageItem key={id} id={id} />
                ))}
                <CompactionBanner />
                <StreamingMessage />
                <FeedbackPrompt />
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          <div className="px-4 pb-4 flex flex-col gap-2">
            <div className="flex justify-center">
              <motion.div
                layoutId="session-island"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              >
                {sessionIsland}
              </motion.div>
            </div>
            <div className="order-2 md:order-1">{promptInput}</div>
            <div className="order-1 md:order-2">{pillsRow}</div>
          </div>
        </>
      )}

      {compact && onMobileTabChange && onMobileNavigate && (
        <PromptMoreDrawer
          isOpen={moreDrawerOpen}
          onClose={() => setMoreDrawerOpen(false)}
          onTabChange={onMobileTabChange}
          onNavigate={onMobileNavigate}
        />
      )}

      <ReforgeModal onInsert={(text) => setInput((prev) => prev ? `${prev}\n\n${text}` : text)} />
    </div>
  );
}
