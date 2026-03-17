import { memo } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { useSmoothText } from '@/hooks/useSmoothText';
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
 * During streaming: useSmoothText buffers bursty network tokens into steady
 * character flow, then feeds smoothed text to Streamdown in streaming mode
 * (which activates remend for markdown healing).
 *
 * On completion: same Streamdown instance switches to static mode.
 * Same DOM tree = no reflow flash (the original bug).
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  isStreaming,
}: StreamingMarkdownProps) {
  const smoothed = useSmoothText(content, isStreaming);
  const animating = isStreaming || smoothed.length < content.length;

  return (
    <div className="prose-chat text-sm leading-relaxed break-words">
      <MessageResponse
        mode={animating ? 'streaming' : 'static'}
        isAnimating={animating}
        components={vfComponents}
        controls={true}
      >
        {animating ? smoothed : content}
      </MessageResponse>
    </div>
  );
});
