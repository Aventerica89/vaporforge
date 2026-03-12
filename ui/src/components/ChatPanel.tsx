import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  Trash2, Paperclip, X,
  Flame, Eye, Zap, Bookmark, MoreHorizontal,
} from 'lucide-react';
import { useSandboxStore, useMessageCount } from '@/hooks/useSandbox';
import { filesApi } from '@/lib/api';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDebugLog } from '@/hooks/useDebugLog';
import { toast } from '@/hooks/useToast';

import { PromptMoreDrawer } from '@/components/mobile/PromptMoreDrawer';
import type { SubView } from '@/hooks/useMobileNav';
import { BorderTrail } from '@/components/motion-primitives/border-trail';
import { SandboxIsland } from '@/components/chat/SandboxIsland';
import { useReforge } from '@/hooks/useReforge';
import { ReforgeModal } from '@/components/chat/ReforgeModal';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';

/** Shows pending pasted/attached images above the textarea with remove buttons. */
function AttachmentDraftStrip() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {attachments.files.map((file) => (
        <div key={file.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
          {file.mediaType.startsWith('image/') ? (
            <img src={file.url} alt={file.filename ?? 'attachment'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
              {file.filename ?? file.mediaType}
            </div>
          )}
          <button
            type="button"
            onClick={() => attachments.remove(file.id)}
            className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-background/80 text-foreground group-hover:flex"
            aria-label="Remove attachment"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
import type { ImageAttachment } from '@/lib/types';
import { SlashCommandMenu } from '@/components/chat/SlashCommandMenu';
import { GlowEffect } from '@/components/motion-primitives/glow-effect';
import { haptics } from '@/lib/haptics';
import { ArrowUp, Square } from 'lucide-react';

import { MessageList } from '@/components/chat/MessageList';
import { PillsRow } from '@/components/chat/PillsRow';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { useEffect } from 'react';
import { useQuickChat } from '@/hooks/useQuickChat';

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  compact?: boolean;
  primary?: boolean;
  onMobileNavigate?: (view: SubView) => void;
}

export function ChatPanel({
  compact = false,
  primary = false,
  onMobileNavigate,
}: ChatPanelProps) {
  const messageCount = useMessageCount();
  const sendMessage = useSandboxStore((s) => s.sendMessage);
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const stopStreaming = useSandboxStore((s) => s.stopStreaming);
  const clearMessages = useSandboxStore((s) => s.clearMessages);
  const currentFile = useSandboxStore((s) => s.currentFile);
  const sdkMode = useSandboxStore((s) => s.sdkMode);
  const setMode = useSandboxStore((s) => s.setMode);
  const sessionId = useSandboxStore((s) => s.currentSession?.id);
  const messagesById = useSandboxStore((s) => s.messagesById);

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

  const [input, setInput] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  useKeyboard();

  // ---------------------------------------------------------------------------
  // Slash command / agent autocomplete
  // ---------------------------------------------------------------------------

  const {
    menuOpen,
    menuState,
    filteredCommands,
    menuIndex,
    handleSlashSelect,
    handleSlashKeyDown,
  } = useSlashCommands(input, setInput, sendMessage);

  // ---------------------------------------------------------------------------
  // Image upload + submit handler
  // ---------------------------------------------------------------------------

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
  const hasInput = input.trim().length > 0;

  const handlePromptSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text && !message.files?.length) return;
      haptics.light();
      let text = message.text;
      let submittedImages: ImageAttachment[] | undefined;

      if (message.files?.length && sessionId) {
        const uploaded: ImageAttachment[] = [];
        for (const file of message.files) {
          if (!file.mediaType?.startsWith('image/')) continue;
          const img: ImageAttachment = {
            id: crypto.randomUUID(),
            filename: file.filename || `${crypto.randomUUID().slice(0, 8)}.png`,
            mimeType: file.mediaType || 'image/png',
            dataUrl: file.url || '',
          };
          const result = await uploadImage(img);
          if (result) uploaded.push(result);
        }
        if (uploaded.length > 0) {
          const refs = uploaded
            .map((img) => `[Image attached: ${img.uploadedPath}]`)
            .join('\n');
          text = text ? `${refs}\n\n${text}` : refs;
          submittedImages = uploaded;
        }
      }

      if (!text) return;
      sendMessage(text, submittedImages);
      setInput('');
    },
    [sendMessage, uploadImage, sessionId],
  );

  // ---------------------------------------------------------------------------
  // Vapor glow palette
  // ---------------------------------------------------------------------------

  const VAPOR_GLOW = useMemo(
    () => ['#a855f7', '#d946ef', '#818cf8', '#7c3aed', '#c026d3'],
    [],
  );

  // ---------------------------------------------------------------------------
  // Prompt input — ai-elements PromptInput with VF composition
  // ---------------------------------------------------------------------------

  const promptInput = (
    <div className="relative">
      {menuOpen && (
        <SlashCommandMenu
          commands={filteredCommands}
          selectedIndex={menuIndex}
          onSelect={handleSlashSelect}
          onDismiss={() => setInput('')}
        />
      )}
      <PromptInput
        onSubmit={handlePromptSubmit}
        accept="image/*"
        multiple
        maxFiles={5}
        maxFileSize={10 * 1024 * 1024}
        className={cn(
          'relative z-10 w-full rounded-3xl bg-card/90 pt-1 backdrop-blur-md overflow-visible',
          isStreaming || hasInput
            ? 'border-purple-500/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.35)]'
            : 'border-primary/50 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.25)] hover:border-primary/70 hover:shadow-[0_0_20px_-4px_hsl(var(--primary)/0.35)]',
        )}
      >
        <AnimatePresence>
          {isStreaming && (
            <BorderTrail
              size={120}
              radius={24}
              className="bg-gradient-to-l from-purple-400/0 via-purple-400 to-purple-400/0"
              transition={{ ease: 'linear', duration: 3, repeat: Infinity }}
            />
          )}
        </AnimatePresence>

        <PromptInputBody>
          <AttachmentDraftStrip />
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleSlashKeyDown}
            placeholder="Ask anything..."
            disabled={!sessionId}
            className="min-h-[44px] max-h-48 pl-4 pt-3 text-base leading-[1.3] field-sizing-content"
            style={{
              fontSize: '16px',
              color: menuOpen
                ? menuState?.kind === 'agent'
                  ? 'hsl(var(--secondary))'
                  : 'hsl(var(--primary))'
                : undefined,
            }}
          />
        </PromptInputBody>

        {/* Mobile action bar (hidden on desktop) */}
        <PromptInputFooter className="flex md:hidden items-center justify-between px-1 pt-1 pb-2">
          <PromptInputTools>
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
              aria-label="Attach file"
              title="Attach file"
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
          </PromptInputTools>
          <div className="pr-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
                title="Stop generating"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <div className="relative">
                <AnimatePresence>
                  {hasInput && (
                    <motion.div key="glow-m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                      <GlowEffect colors={VAPOR_GLOW} mode="pulse" blur="soft" duration={2.5} scale={1.3} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="submit"
                  disabled={!hasInput || !sessionId}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-full transition-all',
                    hasInput ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground/40',
                  )}
                  title="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </PromptInputFooter>

        {/* Desktop submit row */}
        <PromptInputFooter className="hidden md:flex justify-end px-2 pb-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <div className="relative">
              <AnimatePresence>
                {hasInput && (
                  <motion.div key="glow-d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                    <GlowEffect colors={VAPOR_GLOW} mode="pulse" blur="soft" duration={2.5} scale={1.3} />
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="submit"
                disabled={!hasInput || !sessionId}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full transition-all',
                  hasInput ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground/40',
                )}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SessionIsland — shared across welcome + chat states for layoutId animation
  // ---------------------------------------------------------------------------

  const isPaused = useSandboxStore((s) => s.isPaused);
  const pausedAt = useSandboxStore((s) => s.pausedAt);
  const pauseStreaming = useSandboxStore((s) => s.pauseStreaming);
  const resumeStreaming = useSandboxStore((s) => s.resumeStreaming);
  const sentinelActive = useSandboxStore((s) => s.sentinelActive);
  const sentinelDataReady = useSandboxStore((s) => s.sentinelDataReady);
  const toggleSentinel = useSandboxStore((s) => s.toggleSentinel);

  useEffect(() => {
    if (!isPaused || !pausedAt) return;
    const remaining = Math.max(0, 45_000 - (Date.now() - pausedAt));
    const timer = setTimeout(() => {
      toast.warning('Paused for 45s — API connection may drop. Consider resuming.', 8000);
    }, remaining);
    return () => clearTimeout(timer);
  }, [isPaused, pausedAt]);

  const handleToggleSentinel = useCallback(() => {
    if (sentinelDataReady) {
      useSandboxStore.setState({ sentinelDataReady: false, sentinelDataSizeBytes: 0 });
      useQuickChat.getState().openWithSentinel('A background code scan just completed. Read /workspace/.vf-sentinel-report.md and give me a summary of what was found, then ask if I want to address anything.');
      return;
    }
    if (!sentinelActive) {
      toast.info("Unlock Sentinel with Pro \u2014 Automated intelligence scanning while you're away.", 6000);
    }
    toggleSentinel();
  }, [sentinelActive, sentinelDataReady, toggleSentinel]);

  const sessionIsland = (
    <SandboxIsland
      status={isPaused ? 'paused' : isStreaming ? 'streaming' : 'idle'}
      controlsOpen={sessionOpen}
      onNew={clearMessages}
      onPause={pauseStreaming}
      onResume={resumeStreaming}
      onStop={stopStreaming}
      sentinelActive={sentinelActive}
      sentinelDataReady={sentinelDataReady}
      onToggleSentinel={handleToggleSentinel}
    />
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
          <div className="flex flex-1 md:flex-none min-h-0 flex-col items-center justify-center w-full">
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
            <div className="order-1 md:order-2">
              <PillsRow sessionOpen={sessionOpen} onSessionToggle={() => setSessionOpen((v) => !v)} />
            </div>
          </div>
        </div>
      ) : (
        /* Chat state — messages + input + pills at bottom */
        <>
          <MessageList compact={compact} />

          <div className="px-4 pb-4 flex flex-col gap-2 max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-center">
              <motion.div
                layoutId="session-island"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              >
                {sessionIsland}
              </motion.div>
            </div>
            <div className="order-2 md:order-1">{promptInput}</div>
            <div className="order-1 md:order-2">
              <PillsRow sessionOpen={sessionOpen} onSessionToggle={() => setSessionOpen((v) => !v)} />
            </div>
          </div>
        </>
      )}

      {compact && onMobileNavigate && (
        <PromptMoreDrawer
          isOpen={moreDrawerOpen}
          onClose={() => setMoreDrawerOpen(false)}
          onNavigate={onMobileNavigate}
        />
      )}

      <ReforgeModal onInsert={(text) => setInput((prev) => prev ? `${prev}\n\n${text}` : text)} />
    </div>
  );
}
