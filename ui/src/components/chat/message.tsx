import { createContext, useMemo } from 'react';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
} from '@/components/attachments';
import { MessageContent } from '@/components/chat/MessageContent';
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

// ---------------------------------------------------------------------------
// <Message> — root container + context provider
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
        {children}
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
// <MessageBody> — assistant content wrapper
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
// <MessageFooter> — actions slot (assistant only)
// ---------------------------------------------------------------------------

interface MessageFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function MessageFooter({ children, className = '' }: MessageFooterProps) {
  return (
    <div className={`mt-1 flex justify-start ${className}`}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// <MessageAttachments> — parses [Image attached: path] markers
// ---------------------------------------------------------------------------

const IMAGE_PATH_RE = /\[Image attached: ([^\]]+)\]/g;
const COMMAND_RE = /^\[command:(\/[^\]]+)\]\n/;

interface MessageAttachmentsProps {
  message: MessageType;
}

export function MessageAttachments({ message }: MessageAttachmentsProps) {
  // Detect slash command marker — show just the command chip
  const commandMatch = message.content.match(COMMAND_RE);
  if (commandMatch) {
    return (
      <span className="font-mono text-sm font-semibold text-primary-foreground/90">
        {commandMatch[1]}
      </span>
    );
  }

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

  if (imagePaths.length === 0) {
    return <MessageContent message={message} />;
  }

  // Build a path -> dataUrl lookup from message.images
  const pathToDataUrl = useMemo(() => {
    const map = new Map<string, string>();
    if (message.images) {
      for (const img of message.images) {
        if (img.uploadedPath) map.set(img.uploadedPath, img.dataUrl);
      }
    }
    return map;
  }, [message.images]);

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
