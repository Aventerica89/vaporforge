import { useState } from 'react';
import { Check, Copy, Download, Play, FileCode2 } from 'lucide-react';
import { CodeBlock, LANGUAGE_LABELS } from './CodeBlock';

interface ArtifactBlockProps {
  code: string;
  language: string;
  filename?: string;
  /** When provided, shows a Run button that calls this handler */
  onRun?: () => void;
}

export function ArtifactBlock({
  code,
  language,
  filename,
  onRun,
}: ArtifactBlockProps) {
  const [copied, setCopied] = useState(false);

  const langLabel = LANGUAGE_LABELS[language] || language;
  const lineCount = code.split('\n').length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (non-HTTPS, iframe, denied permission)
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `artifact.${language}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="group my-3 overflow-hidden rounded-lg border border-primary/30 bg-background/60 transition-shadow hover:shadow-[0_0_16px_-3px_hsl(var(--primary)/0.2)]">
      {/* Header: filename + language badge */}
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-1.5">
        <FileCode2 className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />

        {filename && (
          <span className="font-mono text-[11px] font-medium text-foreground">
            {filename}
          </span>
        )}

        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {langLabel}
        </span>

        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            title={`Download ${filename || 'file'}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {onRun && (
            <button
              onClick={onRun}
              className="flex h-7 w-7 items-center justify-center rounded text-primary transition-colors hover:bg-primary/10 hover:text-primary"
              title="Run in sandbox"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Code block without its own header */}
      <CodeBlock code={code} language={language} hideHeader />
    </div>
  );
}
