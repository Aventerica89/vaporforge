import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import ShikiHighlighter from 'react-shiki';

interface CodeBlockProps {
  code: string;
  language: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
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

// Shiki theme that works well with dark cyberpunk UIs
const SHIKI_THEME = 'vitesse-dark';

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const label = LANGUAGE_LABELS[language] || language;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border bg-background/60 transition-shadow hover:shadow-[0_0_12px_-3px_hsl(var(--primary)/0.15)]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
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

      {/* Shiki-highlighted code */}
      <div className="overflow-x-auto p-3 text-xs leading-relaxed [&_pre]:!bg-transparent [&_code]:!bg-transparent">
        <ShikiHighlighter language={language} theme={SHIKI_THEME}>
          {code}
        </ShikiHighlighter>
      </div>
    </div>
  );
}
