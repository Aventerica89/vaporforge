import { memo } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { useSmoothText } from '@/hooks/useSmoothText';
import { useSmoothStreaming } from '@/hooks/useSmoothStreaming';
import type { Components } from 'streamdown';

const vfComponents: Components = {
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
      >
        {children}
      </a>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
};

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

/**
 * Unified markdown renderer for streaming and static content.
 *
 * When smoothStreaming is off (default): tokens render directly via Streamdown
 * in streaming mode (which activates remend for markdown healing).
 *
 * When smoothStreaming is on: useSmoothText buffers tokens into steady
 * character flow before feeding to Streamdown.
 *
 * On completion: same Streamdown instance switches to static mode.
 * Same DOM tree = no reflow flash.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  isStreaming,
}: StreamingMarkdownProps) {
  const [smooth] = useSmoothStreaming();
  const smoothed = useSmoothText(content, isStreaming, { disabled: !smooth });
  const animating = smooth
    ? (isStreaming || smoothed.length < content.length)
    : isStreaming;

  return (
    <div className="prose-chat text-sm leading-relaxed break-words">
      <MessageResponse
        mode={animating ? 'streaming' : 'static'}
        isAnimating={animating}
        components={vfComponents}
        controls={true}
      >
        {smooth ? smoothed : content}
      </MessageResponse>
    </div>
  );
});
