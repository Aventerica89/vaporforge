import { useRef, useEffect, useCallback } from 'react';
import { Trash2, Loader2, ArrowDown } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { chatApi } from '@/lib/api';
import { useKeyboard } from '@/hooks/useKeyboard';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import { MessageActions } from '@/components/chat/MessageActions';
import { StreamingIndicator } from '@/components/chat/StreamingIndicator';
import { TypingCursor } from '@/components/chat/TypingCursor';
import { PromptInput } from '@/components/chat/PromptInput';
import { EmptyState } from '@/components/chat/EmptyState';
import {
  Message,
  MessageBubble,
  MessageBody,
  MessageFooter,
  MessageAttachments,
} from '@/components/chat/message';

interface ChatPanelProps {
  /** Hide the header bar — used on mobile where MobileLayout provides chrome */
  compact?: boolean;
  /** Primary workspace mode — hides internal header (chat IS the main area) */
  primary?: boolean;
}

export function ChatPanel({ compact = false, primary = false }: ChatPanelProps) {
  const {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    streamingParts,
    clearMessages,
    currentFile,
  } = useSandboxStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isVisible: keyboardOpen } = useKeyboard();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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
      useSandboxStore.setState({ messages: result.data });
    }
  }, [currentSessionId]);

  const { pullDistance, isRefreshing, handlers: pullHandlers } =
    usePullToRefresh({
      onRefresh: handleRefresh,
      disabled: !compact,
    });

  return (
    <div className={`flex h-full flex-col bg-card ${compact || primary ? '' : 'border-l border-border'}`}>
      {/* Header — hidden in compact (mobile) or primary (center workspace) mode */}
      {!compact && !primary && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Chat
            </span>
            {currentFile && (
              <span className="text-xs text-muted-foreground">
                — {currentFile.name}
              </span>
            )}
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="rounded p-1.5 hover:bg-accent/10"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Compact mode: inline clear button */}
      {compact && messages.length > 0 && (
        <div className="flex justify-end px-3 pt-2">
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent/10"
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
        {messages.length === 0 && !isStreaming ? (
          <EmptyState onSuggestion={(text) => sendMessage(text)} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {messages.map((message) => (
              <Message key={message.id} role={message.role}>
                {message.role === 'user' ? (
                  <MessageBubble>
                    <MessageAttachments message={message} />
                  </MessageBubble>
                ) : (
                  <MessageBody>
                    <MessageContent message={message} />
                    <MessageFooter>
                      <MessageActions content={message.content} />
                    </MessageFooter>
                  </MessageBody>
                )}
              </Message>
            ))}

            {/* Streaming message */}
            {isStreaming && (
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
                </MessageBody>
              </Message>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <PromptInput
        onSubmit={sendMessage}
        isStreaming={isStreaming}
        currentFileName={currentFile?.name}
        compact={compact}
        keyboardOpen={keyboardOpen}
      />
    </div>
  );
}
