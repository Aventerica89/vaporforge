import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock, CodeBlockCode, CodeBlockGroup } from '@/components/prompt-kit/code-block';
import { prepareStreamingMarkdown } from '@/lib/markdown-utils';

interface ChatMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeStr = String(children).replace(/\n$/, '');

    // Fenced code blocks get language-* className from remark
    if (match) {
      // Try to extract filename from meta string (title="file.ts" or just "file.ts")
      const meta = (props as Record<string, unknown>)['data-meta'];
      let filename: string | undefined;
      if (typeof meta === 'string') {
        const titleMatch = /title="?([^"]+)"?/.exec(meta);
        filename = titleMatch ? titleMatch[1] : undefined;
      }

      return (
        <CodeBlock>
          <CodeBlockGroup className="border-b border-zinc-700/60 py-2 pl-4 pr-2">
            <div className="flex items-center gap-2">
              <div className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
                {match[1]}
              </div>
              {filename && <span className="text-xs text-zinc-400">{filename}</span>}
            </div>
          </CodeBlockGroup>
          <CodeBlockCode code={codeStr} language={match[1]} />
        </CodeBlock>
      );
    }

    // No-language fenced block (tree diagrams, file listings, etc.) — multiline
    // detection distinguishes block-level from inline code. Preserves whitespace.
    if (codeStr.includes('\n')) {
      return (
        <pre className="my-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-3 text-xs font-mono leading-relaxed text-foreground/85 whitespace-pre">
          {codeStr}
        </pre>
      );
    }

    // Inline code
    return (
      <code
        className="rounded bg-background/80 px-1.5 py-0.5 text-xs font-mono text-primary"
        {...props}
      >
        {children}
      </code>
    );
  },

  pre({ children }) {
    // Passthrough — CodeBlock handles its own wrapper
    return <>{children}</>;
  },

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

  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-border px-3 py-1.5">{children}</td>
    );
  },

  ul({ children }) {
    return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
  },

  ol({ children }) {
    return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
  },

  h1({ children }) {
    return <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>;
  },

  h2({ children }) {
    return <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>;
  },

  h3({ children }) {
    return <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>;
  },

  hr() {
    return <hr className="my-3 border-border" />;
  },

  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
};

export function ChatMarkdown({ content, isStreaming = false }: ChatMarkdownProps) {
  const processed = isStreaming ? prepareStreamingMarkdown(content) : content;

  // During streaming, skip heavy KaTeX processing — it blocks the main thread
  // and prevents progressive rendering. Math renders once the message finalizes.
  const remarkPlugins = isStreaming ? [remarkGfm] : [remarkGfm, remarkMath];
  const rehypePlugins = isStreaming ? [] : [rehypeKatex];

  return (
    <div className="prose-chat text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
