import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block';
import type { BundledLanguage } from 'shiki';

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');

          if (match) {
            return (
              <CodeBlock code={codeStr} language={match[1] as BundledLanguage}>
                <CodeBlockHeader>
                  <CodeBlockTitle>
                    <CodeBlockFilename>{match[1]}</CodeBlockFilename>
                  </CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton />
                  </CodeBlockActions>
                </CodeBlockHeader>
              </CodeBlock>
            );
          }

          if (codeStr.includes('\n')) {
            return (
              <pre className="my-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-3 text-xs font-mono leading-relaxed whitespace-pre">
                {codeStr}
              </pre>
            );
          }

          return (
            <code className="rounded bg-background/80 px-1.5 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  ),
  (prev, next) => prev.content === next.content,
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(
  ({ content, id }: { content: string; id: string }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return (
      <div className="prose-chat text-sm leading-relaxed break-words">
        {blocks.map((block, index) => (
          <MemoizedMarkdownBlock content={block} key={`${id}-block_${index}`} />
        ))}
      </div>
    );
  },
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
