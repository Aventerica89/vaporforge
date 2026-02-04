import { useState, useEffect } from 'react';
import { gitApi } from '@/lib/api';
import { useSandboxStore } from '@/hooks/useSandbox';

interface DiffViewerProps {
  file?: string;
  staged?: boolean;
}

export function DiffViewer({ file, staged = false }: DiffViewerProps) {
  const { currentSession } = useSandboxStore();
  const [diff, setDiff] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadDiff = async () => {
      if (!currentSession) return;

      setIsLoading(true);
      try {
        const result = await gitApi.diff(currentSession.id, file, staged);
        if (result.success && result.data) {
          setDiff(result.data.diff);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [currentSession, file, staged]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No changes
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-4 font-mono text-sm">
      {diff.split('\n').map((line, index) => (
        <div
          key={index}
          className={`whitespace-pre ${
            line.startsWith('+')
              ? 'bg-green-500/10 text-green-500'
              : line.startsWith('-')
                ? 'bg-red-500/10 text-red-500'
                : line.startsWith('@@')
                  ? 'text-blue-500'
                  : line.startsWith('diff') || line.startsWith('index')
                    ? 'text-muted-foreground'
                    : ''
          }`}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

// Side-by-side diff viewer
export function SideBySideDiff({ file }: { file?: string }) {
  const { currentSession } = useSandboxStore();
  const [diff, setDiff] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadDiff = async () => {
      if (!currentSession) return;

      setIsLoading(true);
      try {
        const result = await gitApi.diff(currentSession.id, file);
        if (result.success && result.data) {
          setDiff(result.data.diff);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [currentSession, file]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No changes
      </div>
    );
  }

  const { leftLines, rightLines } = parseDiffToSideBySide(diff);

  return (
    <div className="flex h-full overflow-auto bg-background font-mono text-sm">
      {/* Left side (original) */}
      <div className="flex-1 border-r border-border">
        <div className="sticky top-0 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
          Original
        </div>
        <div className="p-2">
          {leftLines.map((line, index) => (
            <div
              key={index}
              className={`whitespace-pre px-2 ${
                line.type === 'removed'
                  ? 'bg-red-500/10 text-red-500'
                  : line.type === 'context'
                    ? ''
                    : 'invisible'
              }`}
            >
              <span className="mr-4 select-none text-muted-foreground">
                {line.lineNumber || ' '}
              </span>
              {line.content}
            </div>
          ))}
        </div>
      </div>

      {/* Right side (modified) */}
      <div className="flex-1">
        <div className="sticky top-0 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
          Modified
        </div>
        <div className="p-2">
          {rightLines.map((line, index) => (
            <div
              key={index}
              className={`whitespace-pre px-2 ${
                line.type === 'added'
                  ? 'bg-green-500/10 text-green-500'
                  : line.type === 'context'
                    ? ''
                    : 'invisible'
              }`}
            >
              <span className="mr-4 select-none text-muted-foreground">
                {line.lineNumber || ' '}
              </span>
              {line.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'empty';
  content: string;
  lineNumber?: number;
}

function parseDiffToSideBySide(diff: string): {
  leftLines: DiffLine[];
  rightLines: DiffLine[];
} {
  const lines = diff.split('\n');
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];

  let leftLineNum = 0;
  let rightLineNum = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        leftLineNum = parseInt(match[1], 10);
        rightLineNum = parseInt(match[2], 10);
      }
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith('-')) {
      leftLines.push({
        type: 'removed',
        content: line.slice(1),
        lineNumber: leftLineNum++,
      });
      rightLines.push({ type: 'empty', content: '' });
    } else if (line.startsWith('+')) {
      leftLines.push({ type: 'empty', content: '' });
      rightLines.push({
        type: 'added',
        content: line.slice(1),
        lineNumber: rightLineNum++,
      });
    } else if (line.startsWith(' ')) {
      leftLines.push({
        type: 'context',
        content: line.slice(1),
        lineNumber: leftLineNum++,
      });
      rightLines.push({
        type: 'context',
        content: line.slice(1),
        lineNumber: rightLineNum++,
      });
    }
  }

  return { leftLines, rightLines };
}
