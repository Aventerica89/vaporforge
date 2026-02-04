import { useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { X, Circle } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
  };
  return langMap[ext] || 'plaintext';
}

export function Editor() {
  const {
    openFiles,
    activeFileIndex,
    fileContent,
    updateFileContent,
    saveFile,
    closeFile,
    setActiveFile,
  } = useSandboxStore();

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateFileContent(value);
      }
    },
    [updateFileContent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    },
    [saveFile]
  );

  if (openFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background text-muted-foreground">
        <svg
          className="mb-4 h-16 w-16 opacity-20"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm">Select a file to edit</p>
        <p className="mt-1 text-xs">or use the chat to ask Claude for help</p>
      </div>
    );
  }

  const activeFile = openFiles[activeFileIndex];

  return (
    <div className="flex h-full flex-col bg-background" onKeyDown={handleKeyDown}>
      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        <div className="flex flex-1 overflow-x-auto">
          {openFiles.map((file, index) => (
            <button
              key={file.path}
              onClick={() => setActiveFile(index)}
              className={`group flex items-center gap-2 border-r border-border px-3 py-2 text-sm ${
                index === activeFileIndex
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {file.isDirty && (
                <Circle className="h-2 w-2 fill-current text-blue-500" />
              )}
              <span className="max-w-[150px] truncate">
                {file.path.split('/').pop()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(index);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={getLanguage(activeFile.path)}
          value={fileContent}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', Menlo, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8 },
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border bg-card px-3 py-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{activeFile.path}</span>
          {activeFile.isDirty && (
            <span className="text-blue-500">Modified</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{getLanguage(activeFile.path)}</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
