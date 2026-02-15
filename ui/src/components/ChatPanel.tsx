import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Trash2, Loader2, ArrowDown, Paperclip } from 'lucide-react';
import { useSandboxStore, useMessage, useMessageIds, useMessageCount } from '@/hooks/useSandbox';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { chatApi, filesApi } from '@/lib/api';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDebugLog } from '@/hooks/useDebugLog';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import { MessageActions } from '@/components/chat/MessageActions';
import { StreamingIndicator } from '@/components/chat/StreamingIndicator';
import { TypingCursor } from '@/components/chat/TypingCursor';
import { EmptyState } from '@/components/chat/EmptyState';
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
  const sessionId = useSandboxStore((s) => s.currentSession?.id);
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

  return (
    <div className={`flex h-full flex-col bg-card ${compact || primary ? '' : 'border-l border-border/60'}`}>
      {/* Header — hidden in compact (mobile) or primary (center workspace) mode */}
      {!compact && !primary && (
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
          </div>
          {messageCount > 0 && (
            <button
              onClick={clearMessages}
              className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Compact mode: inline clear button */}
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

      {/* Messages */}
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
        {messageCount === 0 && !isStreaming ? (
          <EmptyState onSuggestion={(text) => sendMessage(text)} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {messageIds.map((id) => (
              <MemoizedMessageItem key={id} id={id} />
            ))}

            {/* Streaming message — isolated subscriber */}
            <StreamingMessage />

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input — compound PromptInput */}
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
        </PromptInputTools>
        <PromptInputSlashMenu />
        <div className="relative rounded-xl border border-border/40 bg-muted/30 shadow-sm transition-all duration-200 focus-within:border-primary/60 focus-within:bg-background focus-within:shadow-[0_0_16px_-4px_hsl(var(--primary)/0.3)] hover:border-border/60 hover:bg-muted/20">
          <PromptInputAttachments />
          <PromptInputTextarea
            placeholder={
              sdkMode === 'plan'
                ? 'Research mode — Claude can read but not edit...'
                : 'Message Claude...'
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
    </div>
  );
}
