import { createContext, useContext, useMemo } from 'react';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
} from '@/components/attachments';
import { MessageContent } from '@/components/chat/MessageContent';
import { MessageAvatar } from '@/components/chat/MessageAvatar';
import { MessageTimestamp } from '@/components/chat/MessageTimestamp';
import type { Message as MessageType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface MessageContextValue {
  role: 'user' | 'assistant' | 'system';
  isStreaming: boolean;
}

const MessageCtx = createContext<MessageContextValue>({
  role: 'assistant',
  isStreaming: false,
});

export function useMessageContext() {
  return useContext(MessageCtx);
}

// ---------------------------------------------------------------------------
// <Message> — root container with avatar gutter + content area
// ---------------------------------------------------------------------------

interface MessageProps {
  role: 'user' | 'assistant' | 'system';
  isStreaming?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Message({
  role,
  isStreaming = false,
  children,
  className = '',
}: MessageProps) {
  const ctx = useMemo(
    () => ({ role, isStreaming }),
    [role, isStreaming],
  );

  return (
    <MessageCtx.Provider value={ctx}>
      <div className={`group/message animate-fade-up ${className}`}>
        {role === 'user' ? (
          // User messages: right-aligned, no avatar gutter
          children
        ) : (
          // Assistant messages: avatar gutter + content
          <div className="flex gap-3">
            <div className="mt-2 flex-shrink-0">
              <MessageAvatar role={role} isStreaming={isStreaming} />
            </div>
            <div className="min-w-0 flex-1">
              {children}
            </div>
          </div>
        )}
      </div>
    </MessageCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// <MessageBubble> — user message bubble (right-aligned)
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  children: React.ReactNode;
  className?: string;
}

export function MessageBubble({ children, className = '' }: MessageBubbleProps) {
  return (
    <div className="flex justify-end">
      <div
        className={[
          'max-w-[85%] rounded-2xl rounded-br-md',
          'bg-primary px-4 py-2.5 text-sm text-primary-foreground',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// <MessageBody> — assistant content wrapper with left border accent
// ---------------------------------------------------------------------------

interface MessageBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function MessageBody({ children, className = '' }: MessageBodyProps) {
  return (
    <div className={`py-2 ${className}`}>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// <MessageFooter> — actions slot with timestamp
// ---------------------------------------------------------------------------

interface MessageFooterProps {
  children: React.ReactNode;
  timestamp?: string;
  className?: string;
}

export function MessageFooter({ children, timestamp, className = '' }: MessageFooterProps) {
  return (
    <div className={`mt-1 flex items-center gap-2 ${className}`}>
      {timestamp && <MessageTimestamp timestamp={timestamp} />}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// <MessageAttachments> — parses [Image attached: path] markers
// ---------------------------------------------------------------------------

const IMAGE_PATH_RE = /\[Image attached: ([^\]]+)\]/g;
const COMMAND_RE = /^\[command:(\/[^\]]+)\]\n/;
// (removed NATIVE_CMD_RE — commands use [command:/name] format with embedded content)

interface MessageAttachmentsProps {
  message: MessageType;
}

export function MessageAttachments({ message }: MessageAttachmentsProps) {
  // Hooks MUST be called unconditionally (Rules of Hooks).
  // Compute all derived state up front, then branch on the results.
  const commandMatch = message.content.match(COMMAND_RE);
  const nativeCmdMatch = null; // disabled — commands use [command:/name] format

  const { textOnly, imagePaths } = useMemo(() => {
    const paths: string[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(IMAGE_PATH_RE.source, IMAGE_PATH_RE.flags);
    while ((match = re.exec(message.content)) !== null) {
      paths.push(match[1]);
    }
    const cleaned = message.content.replace(re, '').trim();
    return { textOnly: cleaned, imagePaths: paths };
  }, [message.content]);

  const pathToDataUrl = useMemo(() => {
    const map = new Map<string, string>();
    if (message.images) {
      for (const img of message.images) {
        if (img.uploadedPath) map.set(img.uploadedPath, img.dataUrl);
      }
    }
    return map;
  }, [message.images]);

  // Now safe to branch — all hooks have been called.

  // Detect [command:/name] marker — show just the command chip
  if (commandMatch) {
    return (
      <span className="text-sm font-semibold text-primary-foreground/90">
        {commandMatch[1]}
      </span>
    );
  }

  // Native SDK slash command (e.g., "/docs", "/review src/auth.ts")
  if (nativeCmdMatch) {
    return (
      <span className="text-sm font-semibold text-primary-foreground/90">
        {nativeCmdMatch[1]}{nativeCmdMatch[2] ? <span className="text-primary-foreground/60">{nativeCmdMatch[2]}</span> : null}
      </span>
    );
  }

  if (imagePaths.length === 0) {
    return <MessageContent message={message} />;
  }

  const hasPreview = imagePaths.some((p) => pathToDataUrl.has(p));

  return (
    <div>
      <Attachments
        variant={hasPreview ? 'grid' : 'inline'}
        className="mb-1.5"
      >
        {imagePaths.map((p, i) => (
          <Attachment key={i}>
            <AttachmentPreview
              src={pathToDataUrl.get(p)}
              mimeType="image/png"
              alt={p.split('/').pop() ?? 'image'}
            />
            {!hasPreview && (
              <AttachmentInfo filename={p.split('/').pop() ?? p} />
            )}
          </Attachment>
        ))}
      </Attachments>
      {textOnly && (
        <MessageContent message={{ ...message, content: textOnly }} />
      )}
    </div>
  );
}
