import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { Plugin, PluginItem } from '@/lib/types';

interface PluginFilePreviewProps {
  plugin: Plugin;
}

/** Resolve file content from a PluginItem by filename match */
function findFileContent(plugin: Plugin, path: string): string | null {
  const filename = path.split('/').pop() || path;

  // Check agents, commands, rules for matching filename
  const allItems: PluginItem[] = [
    ...plugin.agents,
    ...plugin.commands,
    ...plugin.rules,
  ];
  const match = allItems.find((item) => item.filename === filename || item.name === filename);
  return match?.content || null;
}

export function PluginFilePreview({ plugin }: PluginFilePreviewProps) {
  const { selectedFile, fileViewMode, setFileViewMode, clearFile } =
    useIntegrationsStore();

  const content = useMemo(() => {
    if (!selectedFile || selectedFile.pluginId !== plugin.id) return null;
    return findFileContent(plugin, selectedFile.path);
  }, [plugin, selectedFile]);

  if (!selectedFile || selectedFile.pluginId !== plugin.id || content === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <span className="text-lg text-muted-foreground/40">[f]</span>
        <span className="text-[11px] text-muted-foreground">
          Select a file to preview
        </span>
      </div>
    );
  }

  const filename = selectedFile.path.split('/').pop() || selectedFile.path;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3.5">
        <span className="mr-2 min-w-0 truncate text-[11px] font-bold text-foreground">
          {filename}
        </span>
        <div className="flex shrink-0 gap-1">
          <button
            className={`rounded-sm border px-2 py-0.5 font-mono text-[9px] transition-all ${
              fileViewMode === 'rendered'
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setFileViewMode('rendered')}
          >
            view
          </button>
          <button
            className={`rounded-sm border px-2 py-0.5 font-mono text-[9px] transition-all ${
              fileViewMode === 'raw'
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setFileViewMode('raw')}
          >
            code
          </button>
          <button
            className="rounded-sm border border-border px-2 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              navigator.clipboard?.writeText(content).catch(() => {});
            }}
          >
            copy
          </button>
          <button
            className="rounded-sm border border-border px-2 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={clearFile}
          >
            close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 text-[11px] leading-relaxed text-muted-foreground animate-in fade-in duration-150">
        {fileViewMode === 'rendered' ? (
          <div className="prose prose-invert prose-sm max-w-none [&_h1]:mb-3 [&_h1]:border-b [&_h1]:border-border/40 [&_h1]:pb-2 [&_h1]:text-[15px] [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:tracking-wide [&_h2]:text-foreground [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:text-foreground [&_p]:mb-2 [&_p]:text-[11px] [&_p]:text-muted-foreground [&_code]:rounded-sm [&_code]:border [&_code]:border-border/40 [&_code]:bg-card [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-primary [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/40 [&_pre]:bg-card [&_pre]:p-3 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-foreground [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline [&_strong]:text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground/60 [&_table]:text-[10px] [&_th]:bg-card [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold [&_th]:text-foreground [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1 [&_hr]:border-border/40">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
