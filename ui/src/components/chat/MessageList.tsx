import { memo, useEffect, useRef, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { useSandboxStore, useMessage, useMessageIds } from '@/hooks/useSandbox';
import { MessageContent, StreamingContent } from '@/components/chat/MessageContent';
import {
  Message as AIMessage,
  MessageContent as AIMessageContent,
} from '@/components/ai-elements/message';
import { ThinkingBar } from '@/components/chat/thinking-bar';
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
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';

// ---------------------------------------------------------------------------
// Sentinel detection
// ---------------------------------------------------------------------------

const SENTINEL_RE = /^\[sentinel\]\s*/;

// ---------------------------------------------------------------------------
// MemoizedMessageItem — unified responsive (desktop: full footer, mobile: compact)
// ---------------------------------------------------------------------------

export const MemoizedMessageItem = memo(function MessageItem({
  id,
  compact,
}: {
  id: string;
  compact?: boolean;
}) {
  const message = useMessage(id);
  if (!message) return null;

  const isSentinel =
    message.role === 'user' && SENTINEL_RE.test(message.content);
  const displayMessage = isSentinel
    ? { ...message, content: message.content.replace(SENTINEL_RE, '') }
    : message;

  if (compact) {
    return (
      <AIMessage from={message.role}>
        {message.role === 'user' ? (
          <AIMessageContent
            className={
              isSentinel
                ? 'group-[.is-user]:bg-amber-500/15 group-[.is-user]:border group-[.is-user]:border-amber-500/30'
                : 'group-[.is-user]:bg-primary'
            }
          >
            <MessageAttachments message={displayMessage} />
          </AIMessageContent>
        ) : (
          <AIMessageContent>
            <MessageContent message={message} />
            <div className="mt-1 flex items-center">
              <MessageActions content={message.content} messageId={message.id} />
            </div>
          </AIMessageContent>
        )}
      </AIMessage>
    );
  }

  return (
    <Message role={message.role}>
      {message.role === 'user' ? (
        <MessageBubble variant={isSentinel ? 'sentinel' : 'default'}>
          <MessageAttachments message={displayMessage} />
        </MessageBubble>
      ) : (
        <MessageBody>
          <MessageContent message={message} />
          <MessageFooter timestamp={message.timestamp}>
            <MessageActions content={message.content} messageId={message.id} />
            {message.usage && (
              <span
                className="ml-auto text-[10px] tabular-nums text-muted-foreground/50"
                title="Token usage: input / output"
              >
                {message.usage.inputTokens.toLocaleString()}↑{' '}
                {message.usage.outputTokens.toLocaleString()}↓
                {message.usage.costUsd !== undefined && (
                  <>
                    {' '}
                    · $
                    {message.usage.costUsd < 0.001
                      ? message.usage.costUsd.toFixed(5)
                      : message.usage.costUsd.toFixed(4)}
                  </>
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
        <span>
          Compacting context — Claude is condensing the conversation to free up
          memory...
        </span>
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
// StreamingMessage
// ---------------------------------------------------------------------------

function StreamingMessage({ compact }: { compact?: boolean }) {
  const isStreaming = useSandboxStore((s) => s.isStreaming);
  const streamingContent = useSandboxStore((s) => s.streamingContent);
  const streamingParts = useSandboxStore((s) => s.streamingParts);

  // Keep last-seen content so we can show it during the linger period.
  const lastPartsRef = useRef(streamingParts);
  const lastContentRef = useRef(streamingContent);
  // Subscribe directly to the Zustand store to capture text-populated parts
  // before React 18 batching clears them. The completion path sets
  // streamingParts: [] and isStreaming: false in the same atomic set() call —
  // by the time React re-renders, streamingParts is already []. The Zustand
  // subscribe callback runs synchronously at set()-time, outside React's
  // render cycle, so we always see the final non-empty snapshot.
  useEffect(() => {
    return useSandboxStore.subscribe((state) => {
      const parts = state.streamingParts;
      const content = state.streamingContent;
      if (parts.length > 0 || content) {
        lastPartsRef.current = parts;
        lastContentRef.current = content;
      }
    });
  }, []);

  // Linger briefly after streaming ends so useSmoothText can animate the final
  // content batch. Without this, StreamingMessage unmounts immediately when
  // isStreaming->false (e.g. due to TCP Nagle delivering all events at once),
  // and the completed message pops in with no animation.
  const [linger, setLinger] = useState(false);
  useEffect(() => {
    if (!isStreaming && (lastPartsRef.current.length > 0 || lastContentRef.current)) {
      setLinger(true);
      // Dynamic linger: scales with sqrt of accumulated chars so useSmoothText
      // can finish animating long responses. Formula: max(700, ceil(sqrt(N)*15))
      // gives ~849ms at 3200 chars, ~1061ms at 5000, ~1500ms at 10000.
      const chars = lastContentRef.current?.length ?? 0;
      const lingerMs = Math.max(700, Math.ceil(Math.sqrt(chars) * 15));
      const timer = setTimeout(() => setLinger(false), lingerMs);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  if (!isStreaming && !linger) return null;

  const parts = isStreaming ? streamingParts : lastPartsRef.current;
  const content = isStreaming ? streamingContent : lastContentRef.current;
  const hasContent = !!(content || parts.length > 0);

  if (compact) {
    return (
      <AIMessage from="assistant">
        <AIMessageContent>
          {hasContent ? (
            <>
              <StreamingContent
                parts={parts}
                fallbackContent={content}
              />
              <div className="mt-2 flex items-center">
                <MessageActions content={content} isStreaming={isStreaming} />
              </div>
            </>
          ) : (
            <ThinkingBar text="Claude is thinking..." />
          )}
        </AIMessageContent>
      </AIMessage>
    );
  }

  return (
    <Message role="assistant" isStreaming={isStreaming}>
      <MessageBody>
        {hasContent ? (
          <>
            <StreamingContent
              parts={parts}
              fallbackContent={content}
            />
            {isStreaming && <TypingCursor />}
          </>
        ) : (
          <StreamingIndicator parts={parts} hasContent={false} />
        )}
        <MessageFooter>
          <MessageActions content={content} isStreaming={isStreaming} />
        </MessageFooter>
      </MessageBody>
    </Message>
  );
}

// ---------------------------------------------------------------------------
// MessageList — wraps ChatContainerRoot/Content for both compact and desktop
// ---------------------------------------------------------------------------

const GRID_OVERLAY =
  'pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]';

interface MessageListProps {
  compact?: boolean;
}

export function MessageList({ compact }: MessageListProps) {
  const messageIds = useMessageIds();
  // ID of the user message that triggered the current in-progress stream.
  // Used to position StreamingMessage immediately after its paired user
  // bubble so any subsequent optimistic inserts (second message sent while
  // stream 1 is still running) render below the in-progress response rather
  // than above it.
  const streamingForMessageId = useSandboxStore((s) => s.streamingForMessageId);

  // Split messageIds at the streaming anchor point so StreamingMessage renders
  // directly after the user message that triggered it.
  const anchorIdx = streamingForMessageId
    ? messageIds.indexOf(streamingForMessageId)
    : -1;
  const beforeStream = anchorIdx >= 0 ? messageIds.slice(0, anchorIdx + 1) : messageIds;
  const afterStream = anchorIdx >= 0 ? messageIds.slice(anchorIdx + 1) : [];

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div className={GRID_OVERLAY} />
      <Conversation className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-background to-transparent" />
        <ConversationContent
          scrollClassName="scrollbar-none"
          className={
            compact
              ? 'flex flex-col gap-4 px-4 py-3'
              : 'mx-auto max-w-3xl space-y-1 px-4 py-3'
          }
        >
          {beforeStream.map((id) => (
            <MemoizedMessageItem key={id} id={id} compact={compact} />
          ))}
          <StreamingMessage compact={compact} />
          {afterStream.map((id) => (
            <MemoizedMessageItem key={id} id={id} compact={compact} />
          ))}
          <CompactionBanner />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
