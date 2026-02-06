import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Trash2 } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';

export function ChatPanel() {
  const {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    clearMessages,
    currentFile,
  } = useSandboxStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-medium">Chat</h3>
          {currentFile && (
            <p className="text-xs text-muted-foreground">
              Context: {currentFile.name}
            </p>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Ask Claude anything about your code
            </p>
            <div className="mt-4 space-y-2">
              <SuggestionButton
                onClick={() => setInput('Explain this code')}
                text="Explain this code"
              />
              <SuggestionButton
                onClick={() => setInput('Help me fix this bug')}
                text="Help me fix this bug"
              />
              <SuggestionButton
                onClick={() => setInput('Write tests for this file')}
                text="Write tests for this file"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message flex gap-3 ${
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
                <div
                  className={`flex-1 rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words overflow-wrap-anywhere">
                    {message.content}
                  </div>
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                      {message.toolCalls.map((tool) => (
                        <div
                          key={tool.id}
                          className="rounded bg-background/50 px-2 py-1 text-xs"
                        >
                          <span className="font-medium">{tool.name}</span>
                          {tool.output && (
                            <pre className="mt-1 overflow-x-auto text-muted-foreground">
                              {tool.output.slice(0, 200)}
                              {tool.output.length > 200 && '...'}
                            </pre>
                          )}
                        </div>
                      ))}
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
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words overflow-wrap-anywhere">
                    {streamingContent || (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude..."
            rows={1}
            disabled={isStreaming}
            className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
            style={{ color: 'hsl(var(--foreground))' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute bottom-3 right-3 rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function SuggestionButton({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      {text}
    </button>
  );
}
