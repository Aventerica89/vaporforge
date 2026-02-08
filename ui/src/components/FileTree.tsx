import { useState, useEffect, useRef } from 'react';
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
  Upload,
  Download,
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
    uploadFiles,
    downloadFile,
    downloadWorkspace,
  } = useSandboxStore();

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/workspace'])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setIsUploading(true);
      await uploadFiles(droppedFiles);
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setIsUploading(true);
      await uploadFiles(selected);
      setIsUploading(false);
    }
    e.target.value = '';
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
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="Upload files"
          >
            {isUploading ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => downloadWorkspace()}
            className="rounded p-1 hover:bg-accent"
            title="Download workspace (.tar.gz)"
          >
            <Download className="h-4 w-4" />
          </button>
          <button className="rounded p-1 hover:bg-accent" title="New File">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

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

      {/* File list with drag-and-drop */}
      <div
        ref={dropRef}
        className={`flex-1 overflow-y-auto py-1 relative ${
          isDragging ? 'ring-2 ring-primary/50 ring-inset' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-primary/50 px-8 py-6">
              <Upload className="h-8 w-8 text-primary/70" />
              <span className="text-sm font-medium text-primary">
                Drop files to upload
              </span>
            </div>
          </div>
        )}

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
                  const parentPath =
                    currentPath
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
                onDownload={downloadFile}
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
  onDownload: (path: string) => Promise<void>;
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
  onDownload,
}: FileTreeItemProps) {
  const isDirectory = file.type === 'directory';
  const Icon = isDirectory
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(file.name);

  return (
    <>
      <div
        className="group flex w-full items-center hover:bg-accent"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={onClick}
          className="flex flex-1 items-center gap-1 py-1 text-sm min-w-0"
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
        {!isDirectory && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(file.path);
            }}
            className="mr-2 rounded p-1 opacity-0 text-foreground hover:bg-foreground/15 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Download file"
          >
            <Download className="h-3 w-3" />
          </button>
        )}
      </div>

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
              onDownload={onDownload}
            />
          ))}
        </div>
      )}
    </>
  );
}
