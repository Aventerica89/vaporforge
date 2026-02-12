import { useState, useCallback, useRef } from 'react';
import {
  GripVertical,
  ChevronDown,
  X,
  Image as ImageIcon,
  Trash2,
  ClipboardCopy,
  Check,
} from 'lucide-react';
import { useIssueTracker, formatIssue } from '@/hooks/useIssueTracker';
import type { Issue } from '@/hooks/useIssueTracker';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_SCREENSHOTS = 10;

const TYPE_COLORS: Record<Issue['type'], string> = {
  bug: 'bg-red-500/15 text-red-400 border-red-500/30',
  error: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  feature: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  suggestion: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const SIZE_COLORS: Record<Issue['size'], string> = {
  S: 'bg-green-500/15 text-green-400',
  M: 'bg-yellow-500/15 text-yellow-400',
  L: 'bg-red-500/15 text-red-400',
};

interface IssueCardProps {
  issue: Issue;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
}

export function IssueCard({
  issue,
  index,
  onDragStart,
  onDragOver,
  onDrop,
}: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingSize, setEditingSize] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const {
    updateIssue,
    removeIssue,
    toggleResolved,
    addScreenshot,
    removeScreenshot,
    setClaudeNote,
  } = useIssueTracker();

  const handleImageFile = useCallback(
    (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) return;
      if (issue.screenshots.length >= MAX_SCREENSHOTS) return;

      const reader = new FileReader();
      reader.onload = () => {
        addScreenshot(issue.id, {
          id: crypto.randomUUID(),
          dataUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    },
    [issue.id, issue.screenshots.length, addScreenshot]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      for (const file of Array.from(files)) {
        if (ALLOWED_TYPES.includes(file.type)) {
          e.preventDefault();
          handleImageFile(file);
        }
      }
    },
    [handleImageFile]
  );

  const handleDropImage = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      for (const file of Array.from(files)) {
        handleImageFile(file);
      }
    },
    [handleImageFile]
  );

  const handleDragOverImage = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeaveImage = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={`group rounded-lg border border-border bg-card/50 transition-colors ${
        issue.resolved ? 'opacity-60' : ''
      }`}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Drag handle */}
        <span className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </span>

        {/* Resolve checkbox */}
        <button
          onClick={() => toggleResolved(issue.id)}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            issue.resolved
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 hover:border-primary'
          }`}
          title={issue.resolved ? 'Mark unresolved' : 'Mark resolved'}
        >
          {issue.resolved && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>

        {/* Type badge - editable */}
        {editingType ? (
          <select
            value={issue.type}
            onChange={(e) => {
              updateIssue(issue.id, { type: e.target.value as Issue['type'] });
              setEditingType(false);
            }}
            onBlur={() => setEditingType(false)}
            autoFocus
            className="shrink-0 rounded border border-primary bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
          >
            <option value="bug">BUG</option>
            <option value="error">ERROR</option>
            <option value="feature">FEATURE</option>
            <option value="suggestion">IDEA</option>
          </select>
        ) : (
          <button
            onClick={() => setEditingType(true)}
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-70 ${TYPE_COLORS[issue.type]}`}
            title="Click to edit type"
          >
            {issue.type}
          </button>
        )}

        {/* Size chip - editable */}
        {editingSize ? (
          <select
            value={issue.size}
            onChange={(e) => {
              updateIssue(issue.id, { size: e.target.value as Issue['size'] });
              setEditingSize(false);
            }}
            onBlur={() => setEditingSize(false)}
            autoFocus
            className="shrink-0 rounded bg-card px-1.5 py-0.5 text-[10px] font-bold border border-primary text-primary"
          >
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        ) : (
          <button
            onClick={() => setEditingSize(true)}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-70 ${SIZE_COLORS[issue.size]}`}
            title="Click to edit size"
          >
            {issue.size}
          </button>
        )}

        {/* Title — click to expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex-1 truncate text-left text-sm ${
            issue.resolved
              ? 'line-through text-muted-foreground'
              : 'text-foreground'
          }`}
        >
          {issue.title}
        </button>

        {/* Screenshot count */}
        {issue.screenshots.length > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            {issue.screenshots.length}
          </span>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Copy single issue */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(formatIssue(issue)).catch(() => {});
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
          title="Copy as Markdown"
        >
          <ClipboardCopy className="h-3 w-3" />
        </button>

        {/* Delete */}
        <button
          onClick={() => removeIssue(issue.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          title="Delete issue"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="space-y-3 border-t border-border/50 px-3 py-3"
          onPaste={handlePaste}
        >
          {/* Description */}
          <textarea
            value={issue.description}
            onChange={(e) =>
              updateIssue(issue.id, { description: e.target.value })
            }
            placeholder="Describe the issue..."
            rows={6}
            className="w-full resize-y rounded border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Screenshot drop zone */}
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOverImage}
            onDragLeave={handleDragLeaveImage}
            onDrop={handleDropImage}
            className={`rounded border-2 border-dashed px-3 py-2 text-center text-xs transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border/50 text-muted-foreground/60'
            }`}
          >
            Drop or paste images here
          </div>

          {/* Screenshot gallery */}
          {issue.screenshots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {issue.screenshots.map((ss) => (
                <div key={ss.id} className="group/thumb relative">
                  <button
                    onClick={() => setPreviewImage(ss.dataUrl)}
                    className="block"
                  >
                    <img
                      src={ss.dataUrl}
                      alt="Screenshot"
                      className="h-16 w-16 rounded border border-border object-cover transition-opacity hover:opacity-80"
                    />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(ss.dataUrl);
                        const blob = await response.blob();
                        await navigator.clipboard.write([
                          new ClipboardItem({ [blob.type]: blob })
                        ]);
                      } catch (err) {
                        console.error('Failed to copy image:', err);
                      }
                    }}
                    className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                    title="Copy image"
                  >
                    <ClipboardCopy className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={() => removeScreenshot(issue.id, ss.id)}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Image preview modal */}
          {previewImage && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
              onClick={() => setPreviewImage(null)}
            >
              <div className="relative max-h-[90vh] max-w-[90vw]">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const response = await fetch(previewImage);
                      const blob = await response.blob();
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                      ]);
                    } catch (err) {
                      console.error('Failed to copy image:', err);
                    }
                  }}
                  className="absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
                  title="Copy image"
                >
                  <ClipboardCopy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <img
                  src={previewImage}
                  alt="Screenshot preview"
                  className="max-h-[90vh] max-w-full rounded border-2 border-white/20 object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Claude note */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Claude Note
            </label>
            <textarea
              value={issue.claudeNote || ''}
              onChange={(e) => setClaudeNote(issue.id, e.target.value)}
              placeholder="AI-suggested fix or context..."
              rows={2}
              className="w-full resize-none rounded border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Metadata */}
          <div className="text-[10px] text-muted-foreground/50">
            Created {new Date(issue.createdAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
