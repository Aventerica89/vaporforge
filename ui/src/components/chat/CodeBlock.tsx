import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import ShikiHighlighter from 'react-shiki';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useTheme } from '@/hooks/useTheme';
import { haptics } from '@/lib/haptics';

interface CodeBlockProps {
  code: string;
  language: string;
  /** Optional filename shown in the header bar */
  filename?: string;
  /** When true, skip rendering the header bar (caller provides its own) */
  hideHeader?: boolean;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  yml: 'YAML',
  sql: 'SQL',
  md: 'Markdown',
  markdown: 'Markdown',
  diff: 'Diff',
  rust: 'Rust',
  go: 'Go',
  toml: 'TOML',
  dockerfile: 'Dockerfile',
};

export function CodeBlock({ code, language, filename, hideHeader = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isTouch = useIsTouchDevice();
  const { isDark } = useTheme();
  const shikiTheme = isDark ? 'vitesse-dark' : 'vitesse-light';

  const label = filename || LANGUAGE_LABELS[language] || language;
  const lineCount = code.split('\n').length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    haptics.light();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border/60 bg-background/60 transition-shadow hover:shadow-[0_0_12px_-3px_hsl(var(--primary)/0.15)]">
      {/* Header bar (skipped when parent provides its own) */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              {label}
            </span>
            {filename && language && (
              <span className="text-[10px] text-muted-foreground/60">
                {LANGUAGE_LABELS[language] || language}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground/50">
              {lineCount} {lineCount === 1 ? 'line' : 'lines'}
            </span>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-opacity hover:text-foreground ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-success" />
                  <span className="text-success">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Code with line numbers */}
      <div className="flex overflow-x-auto text-xs leading-relaxed">
        {/* Line numbers gutter */}
        <div
          className="flex-shrink-0 select-none border-r border-border/20 bg-muted/10 py-3 text-right font-mono text-[11px] text-muted-foreground/30"
          aria-hidden="true"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="px-3 leading-relaxed">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Highlighted code */}
        <div className="min-w-0 flex-1 p-3 [&_pre]:!bg-transparent [&_code]:!bg-transparent">
          <ShikiHighlighter language={language} theme={shikiTheme}>
            {code}
          </ShikiHighlighter>
        </div>
      </div>
    </div>
  );
}
