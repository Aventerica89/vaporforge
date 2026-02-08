import { FilePlus, FileEdit, FileX, ChevronRight } from 'lucide-react';
import { useState, useRef } from 'react';

interface FileChangeBlockProps {
  action: 'create' | 'edit' | 'delete';
  filePath: string;
  /** Optional diff or content preview */
  preview?: string;
}

const ACTION_CONFIG = {
  create: {
    icon: FilePlus,
    label: 'Created',
    color: 'text-success',
    borderColor: 'border-success/20',
  },
  edit: {
    icon: FileEdit,
    label: 'Edited',
    color: 'text-warning',
    borderColor: 'border-warning/20',
  },
  delete: {
    icon: FileX,
    label: 'Deleted',
    color: 'text-error',
    borderColor: 'border-error/20',
  },
} as const;

export function FileChangeBlock({ action, filePath, preview }: FileChangeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const config = ACTION_CONFIG[action];
  const Icon = config.icon;

  // Extract just the filename from the path
  const fileName = filePath.split('/').pop() || filePath;
  const dirPath = filePath.includes('/')
    ? filePath.slice(0, filePath.lastIndexOf('/'))
    : '';

  return (
    <div className={`my-1.5 rounded-md border ${config.borderColor} bg-muted/10`}>
      <button
        onClick={() => preview && setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs"
        disabled={!preview}
      >
        {preview && (
          <ChevronRight
            className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        )}
        <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${config.color}`} />
        <span className={`text-[10px] font-medium uppercase ${config.color}`}>
          {config.label}
        </span>
        <span className="font-mono font-medium text-foreground">{fileName}</span>
        {dirPath && (
          <span className="truncate font-mono text-muted-foreground/60">
            {dirPath}
          </span>
        )}
      </button>

      {/* Preview content */}
      {preview && (
        <div
          ref={contentRef}
          className="transition-all duration-200 ease-out"
          style={{
            maxHeight: expanded
              ? `${(contentRef.current?.scrollHeight || 300) + 16}px`
              : '0px',
            opacity: expanded ? 1 : 0,
            overflow: 'hidden',
          }}
        >
          <pre className="max-h-48 overflow-auto border-t border-border/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}
