import { useRef, useEffect } from 'react';
import { User, Bot, Trash2 } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import { MessageActions } from '@/components/chat/MessageActions';
import { StreamingIndicator } from '@/components/chat/StreamingIndicator';
import { TypingCursor } from '@/components/chat/TypingCursor';
import { PromptInput } from '@/components/chat/PromptInput';
import { EmptyState } from '@/components/chat/EmptyState';

interface ChatPanelProps {
  /** Hide the header bar — used on mobile where MobileLayout provides chrome */
  compact?: boolean;
}

export function ChatPanel({ compact = false }: ChatPanelProps) {
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

  // Auto-scroll when keyboard opens so latest messages stay visible
  useEffect(() => {
    if (keyboardOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [keyboardOpen]);

  return (
    <div className={`flex h-full flex-col bg-card ${compact ? '' : 'border-l border-border'}`}>
      {/* Header — hidden in compact (mobile) mode */}
      {!compact && (
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
              className="rounded p-1.5 hover:bg-accent"
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
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            title="Clear chat"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState onSuggestion={(text) => sendMessage(text)} />
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`group/message chat-message flex gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <MessageContent message={message} />
                  </div>
                  {message.role === 'assistant' && (
                    <div className="mt-1 flex justify-end">
                      <MessageActions content={message.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && (
              <div className="chat-message flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-lg bg-muted px-4 py-3">
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
                </div>
              </div>
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
