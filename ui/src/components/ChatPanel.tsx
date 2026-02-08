import { useRef, useEffect, useMemo } from 'react';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import type { Message } from '@/lib/types';
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

  // Auto-scroll when keyboard opens
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
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState onSuggestion={(text) => sendMessage(text)} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {messages.map((message) => (
              <div
                key={message.id}
                className="group/message animate-fade-up"
              >
                {message.role === 'user' ? (
                  /* User message — right-aligned bubble */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      <UserMessageContent message={message} />
                    </div>
                  </div>
                ) : (
                  /* Assistant message — full-width, no bubble */
                  <div className="py-2">
                    <div className="text-sm text-foreground">
                      <MessageContent message={message} />
                    </div>
                    <div className="mt-1 flex justify-start">
                      <MessageActions content={message.content} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && (
              <div className="py-2 animate-fade-up">
                <div className="text-sm text-foreground">
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

/** Renders user message with inline image path indicators */
function UserMessageContent({ message }: { message: Message }) {
  const IMAGE_PATH_RE = /\[Image attached: ([^\]]+)\]/g;

  const { textOnly, imagePaths } = useMemo(() => {
    const paths: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = IMAGE_PATH_RE.exec(message.content)) !== null) {
      paths.push(match[1]);
    }
    const cleaned = message.content.replace(IMAGE_PATH_RE, '').trim();
    return { textOnly: cleaned, imagePaths: paths };
  }, [message.content]);

  if (imagePaths.length === 0) {
    return <MessageContent message={message} />;
  }

  return (
    <div>
      {/* Image badges */}
      <div className="mb-1.5 flex flex-wrap gap-1">
        {imagePaths.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium"
          >
            <ImageIcon className="h-3 w-3" />
            {p.split('/').pop()}
          </span>
        ))}
      </div>
      {/* Text content */}
      {textOnly && (
        <MessageContent
          message={{ ...message, content: textOnly }}
        />
      )}
    </div>
  );
}
