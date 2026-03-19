import { marked } from 'marked';
import { memo, useMemo } from 'react';
import { ChatMarkdown } from './ChatMarkdown';

/**
 * Memoized markdown renderer that splits content into blocks and only
 * re-renders the block that changed. This eliminates the reflow flash
 * caused by switching between SmoothText (streaming) and ChatMarkdown
 * (completed) — now it's ChatMarkdown the whole time.
 *
 * Pattern from AI SDK cookbook:
 * https://github.com/vercel/ai/blob/main/content/cookbook/01-next/25-markdown-chatbot-with-memoization.mdx
 */

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedBlock = memo(
  ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => {
    return <ChatMarkdown content={content} isStreaming={isStreaming} />;
  },
  (prev, next) => prev.content === next.content && prev.isStreaming === next.isStreaming,
);
MemoizedBlock.displayName = 'MemoizedBlock';

export const MemoizedChatMarkdown = memo(
  ({ content, id, isStreaming }: { content: string; id: string; isStreaming?: boolean }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return (
      <>
        {blocks.map((block, index) => (
          <MemoizedBlock
            key={`${id}-block_${index}`}
            content={block}
            isStreaming={isStreaming}
          />
        ))}
      </>
    );
  },
);
MemoizedChatMarkdown.displayName = 'MemoizedChatMarkdown';
