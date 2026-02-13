import { useState, useEffect, useCallback, useRef } from 'react';
import {
  HardDrive,
  Loader2,
  Trash2,
  Upload,
  Image,
  File,
  FileText,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
} from 'lucide-react';
import { vaporFilesApi } from '@/lib/api';
import type { VaporFile } from '@/lib/api';
import { toast } from '@/hooks/useToast';

const MIME_ICONS: Record<string, typeof Image> = {
  'image/': Image,
  'text/': FileText,
  'application/pdf': FileText,
};

function getFileIcon(mimeType: string) {
  for (const [prefix, Icon] of Object.entries(MIME_ICONS)) {
    if (mimeType.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VaporFilesTab() {
  const [files, setFiles] = useState<VaporFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<VaporFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await vaporFilesApi.list();
      if (result.success && result.data) {
        setFiles(result.data);
      }
    } catch {
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);

    try {
      for (const file of Array.from(fileList)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB limit`);
          continue;
        }
        await vaporFilesApi.uploadFile(file, file.name);
      }
      toast.success(`Uploaded ${fileList.length} file${fileList.length > 1 ? 's' : ''}`);
      await loadFiles();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (file: VaporFile) => {
    setDeletingId(file.id);
    try {
      await vaporFilesApi.delete(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (previewFile?.id === file.id) setPreviewFile(null);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyUrl = async (file: VaporFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const imageFiles = files.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = files.filter((f) => !f.mimeType.startsWith('image/'));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <HardDrive className="h-4 w-4 text-primary" />
          VaporFiles
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadFiles}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-primary" />
            )}
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        Files stored in Cloudflare R2 — persists across sessions.
        Upload images, docs, or any file up to 10MB.
        <span className="ml-1 font-mono text-primary">
          {files.length} file{files.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed transition-colors px-4 py-6 text-center ${
          isDragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border/60 text-muted-foreground hover:border-primary/40'
        }`}
      >
        <Upload className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <p className="text-xs">
          {isDragging ? 'Drop files here' : 'Drag and drop files here, or click Upload'}
        </p>
      </div>

      {/* Image gallery */}
      {imageFiles.length > 0 && (
        <div>
          <h4 className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Images ({imageFiles.length})
          </h4>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {imageFiles.map((file) => (
              <div
                key={file.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/30 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setPreviewFile(file)}
              >
                <img
                  src={file.url}
                  alt={file.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="max-w-full truncate px-2 text-[10px] font-medium text-white">
                    {file.name}
                  </p>
                  <p className="text-[9px] text-white/60">{formatBytes(file.size)}</p>
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyUrl(file); }}
                      className="rounded bg-white/10 p-1 hover:bg-white/20 transition-colors"
                      title="Copy URL"
                    >
                      {copiedId === file.id ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-white" />
                      )}
                    </button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded bg-white/10 p-1 hover:bg-white/20 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3 text-white" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                      disabled={deletingId === file.id}
                      className="rounded bg-white/10 p-1 hover:bg-red-500/30 transition-colors"
                      title="Delete"
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-white" />
                      ) : (
                        <Trash2 className="h-3 w-3 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other files list */}
      {otherFiles.length > 0 && (
        <div>
          <h4 className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Documents ({otherFiles.length})
          </h4>
          <div className="space-y-1">
            {otherFiles.map((file) => {
              const FileIcon = getFileIcon(file.mimeType);
              return (
                <div
                  key={file.id}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopyUrl(file)}
                      className="rounded p-1 hover:bg-accent transition-colors"
                      title="Copy URL"
                    >
                      {copiedId === file.id ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 hover:bg-accent transition-colors"
                      title="Open"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={deletingId === file.id}
                      className="rounded p-1 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HardDrive className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">No files yet</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Upload files or paste images in the issue tracker
          </p>
        </div>
      )}

      {/* Image preview modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewFile(null)}
        >
          <button
            onClick={() => setPreviewFile(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[85vh] max-w-[90vw] overflow-hidden rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewFile.url}
              alt={previewFile.name}
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg bg-black/60 px-4 py-2 text-white">
            <span className="text-sm font-medium">{previewFile.name}</span>
            <span className="text-xs text-white/60">{formatBytes(previewFile.size)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopyUrl(previewFile); }}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 transition-colors"
            >
              {copiedId === previewFile.id ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
