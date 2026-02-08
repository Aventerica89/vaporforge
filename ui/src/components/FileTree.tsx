import { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  Search,
  Home,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import type { FileInfo } from '@/lib/types';

const FILE_ICONS: Record<string, typeof File> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  json: FileJson,
  md: FileText,
  txt: FileText,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || File;
}

/** Split a path into breadcrumb segments */
function pathSegments(path: string): Array<{ name: string; path: string }> {
  const parts = path.split('/').filter(Boolean);
  const segments: Array<{ name: string; path: string }> = [];
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    segments.push({ name: part, path: current });
  }
  return segments;
}

export function FileTree() {
  const {
    files,
    filesByPath,
    currentPath,
    loadFiles,
    navigateTo,
    openFile,
    isLoadingFiles,
    currentSession,
  } = useSandboxStore();

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/workspace'])
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentSession) {
      loadFiles();
    }
  }, [currentSession, loadFiles]);

  const toggleExpand = async (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      await loadFiles(path);
    }
    setExpandedPaths(newExpanded);
  };

  const handleFileClick = (file: FileInfo) => {
    if (file.type === 'directory') {
      toggleExpand(file.path);
    } else {
      openFile(file.path);
    }
  };

  const handleNavigate = (path: string) => {
    navigateTo(path);
    setExpandedPaths(new Set([path]));
  };

  const segments = pathSegments(currentPath);
  const isAtRoot = currentPath === '/workspace';

  const filteredFiles = searchQuery
    ? files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files;

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {!isAtRoot && (
            <button
              onClick={() => handleNavigate('/workspace')}
              className="rounded p-1 hover:bg-accent"
              title="Go to workspace root"
            >
              <Home className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => loadFiles()}
            className="rounded p-1 hover:bg-accent"
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingFiles ? 'animate-spin' : ''}`}
            />
          </button>
          <button className="rounded p-1 hover:bg-accent" title="New File">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      {!isAtRoot && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5 text-xs">
          <button
            onClick={() => handleNavigate('/workspace')}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            workspace
          </button>
          {segments.slice(1).map((seg) => (
            <span key={seg.path} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
              <button
                onClick={() => handleNavigate(seg.path)}
                className={`flex-shrink-0 ${
                  seg.path === currentPath
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {seg.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="border-b border-border px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full rounded-md border border-border bg-background py-1 pl-8 pr-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoadingFiles && files.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No files found' : 'No files'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Parent directory entry when not at root */}
            {!isAtRoot && !searchQuery && (
              <button
                onClick={() => {
                  const parentPath = currentPath
                    .split('/')
                    .slice(0, -1)
                    .join('/') || '/workspace';
                  handleNavigate(parentPath);
                }}
                className="flex w-full items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
                style={{ paddingLeft: '8px' }}
              >
                <ChevronRight className="h-4 w-4 flex-shrink-0 rotate-180" />
                <Folder className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                <span>..</span>
              </button>
            )}
            {filteredFiles.map((file) => (
              <FileTreeItem
                key={file.path}
                file={file}
                depth={0}
                isExpanded={expandedPaths.has(file.path)}
                childFiles={filesByPath[file.path]}
                expandedPaths={expandedPaths}
                allFilesByPath={filesByPath}
                onClick={() => handleFileClick(file)}
                onToggle={toggleExpand}
                onOpen={openFile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FileTreeItemProps {
  file: FileInfo;
  depth: number;
  isExpanded: boolean;
  childFiles?: FileInfo[];
  expandedPaths: Set<string>;
  allFilesByPath: Record<string, FileInfo[]>;
  onClick: () => void;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}

function FileTreeItem({
  file,
  depth,
  isExpanded,
  childFiles,
  expandedPaths,
  allFilesByPath,
  onClick,
  onToggle,
  onOpen,
}: FileTreeItemProps) {
  const isDirectory = file.type === 'directory';
  const Icon = isDirectory
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(file.name);

  return (
    <>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-accent"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDirectory ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-4" />
        )}
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${
            isDirectory ? 'text-yellow-500' : 'text-muted-foreground'
          }`}
        />
        <span className="truncate">{file.name}</span>
      </button>

      {/* Render children when expanded */}
      {isDirectory && isExpanded && childFiles && (
        <div>
          {childFiles.map((child) => (
            <FileTreeItem
              key={child.path}
              file={child}
              depth={depth + 1}
              isExpanded={expandedPaths.has(child.path)}
              childFiles={allFilesByPath[child.path]}
              expandedPaths={expandedPaths}
              allFilesByPath={allFilesByPath}
              onClick={() =>
                child.type === 'directory'
                  ? onToggle(child.path)
                  : onOpen(child.path)
              }
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </>
  );
}
