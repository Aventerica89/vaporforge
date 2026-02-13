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
import { useIssueTracker, formatIssue, uploadIssueScreenshots } from '@/hooks/useIssueTracker';
import { toast } from '@/hooks/useToast';
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
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
}

export function IssueCard({
  issue,
  index,
  selected,
  onToggleSelect,
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
      <div className="flex items-center gap-3 px-4 py-3 sm:gap-2 sm:px-3 sm:py-2.5">
        {/* Selection checkbox */}
        {onToggleSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(issue.id);
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary/60'
            }`}
            title="Select for batch action"
          >
            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
        )}

        {/* Drag handle */}
        <button className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing sm:min-h-0 sm:min-w-0">
          <GripVertical className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
        </button>

        {/* Resolve checkbox */}
        <button
          onClick={() => toggleResolved(issue.id)}
          className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded border transition-colors sm:h-4 sm:w-4 sm:min-h-0 sm:min-w-0 ${
            issue.resolved
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 hover:border-primary'
          }`}
          title={issue.resolved ? 'Mark unresolved' : 'Mark resolved'}
        >
          {issue.resolved && <Check className="h-5 w-5 sm:h-3 sm:w-3" strokeWidth={3} />}
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
            className="shrink-0 min-h-[44px] rounded border border-primary bg-card px-3 py-2.5 text-base font-bold uppercase tracking-wider text-primary sm:min-h-0 sm:px-1.5 sm:py-0.5 sm:text-[10px]"
          >
            <option value="bug">BUG</option>
            <option value="error">ERROR</option>
            <option value="feature">FEATURE</option>
            <option value="suggestion">IDEA</option>
          </select>
        ) : (
          <button
            onClick={() => setEditingType(true)}
            className={`shrink-0 min-h-[44px] rounded border px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-70 sm:min-h-0 sm:px-1.5 sm:py-0.5 sm:text-[10px] ${TYPE_COLORS[issue.type]}`}
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
            className="shrink-0 min-h-[44px] min-w-[44px] rounded bg-card px-3 py-2.5 text-base font-bold border border-primary text-primary sm:min-h-0 sm:min-w-0 sm:px-1.5 sm:py-0.5 sm:text-[10px]"
          >
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        ) : (
          <button
            onClick={() => setEditingSize(true)}
            className={`shrink-0 min-h-[44px] min-w-[44px] rounded px-3 py-2.5 text-sm font-bold transition-opacity hover:opacity-70 sm:min-h-0 sm:min-w-0 sm:px-1.5 sm:py-0.5 sm:text-[10px] ${SIZE_COLORS[issue.size]}`}
            title="Click to edit size"
          >
            {issue.size}
          </button>
        )}

        {/* Title — click to expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex-1 truncate text-left text-base sm:text-sm ${
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
          className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground sm:min-h-0 sm:min-w-0"
        >
          <ChevronDown
            className={`h-5 w-5 transition-transform sm:h-3.5 sm:w-3.5 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Copy single issue */}
        <button
          onClick={async () => {
            try {
              // Upload screenshots to VaporFiles first
              const issueWithUrls = await uploadIssueScreenshots(issue);
              const markdown = formatIssue(issueWithUrls, true);

              // Copy markdown with VaporFiles URLs
              await navigator.clipboard.writeText(markdown);
              console.log('[IssueCard] Successfully copied issue to clipboard');
              toast.success('Issue copied to clipboard');
            } catch (err) {
              console.error('[IssueCard] Failed to copy issue:', err);
              // Log details about the error for debugging
              if (err instanceof Error) {
                console.error('[IssueCard] Error details:', {
                  message: err.message,
                  name: err.name,
                  stack: err.stack,
                });
              }
              toast.error('Failed to copy issue to clipboard');
            }
          }}
          className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded p-2 text-muted-foreground/40 opacity-100 transition-opacity hover:text-primary sm:min-h-0 sm:min-w-0 sm:p-0.5 md:opacity-0 md:group-hover:opacity-100"
          title="Copy issue with VaporFiles URLs"
        >
          <ClipboardCopy className="h-4 w-4 sm:h-3 sm:w-3" />
        </button>

        {/* Delete */}
        <button
          onClick={() => removeIssue(issue.id)}
          className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded p-2 text-muted-foreground/40 opacity-100 transition-opacity hover:text-red-500 sm:min-h-0 sm:min-w-0 sm:p-0.5 md:opacity-0 md:group-hover:opacity-100"
          title="Delete issue"
        >
          <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="space-y-3 border-t border-border/50 px-4 py-3 sm:px-3"
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
            className="w-full resize-y rounded border border-border bg-muted px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:py-2 sm:text-sm"
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
                        console.log('[IssueCard] Attempting to copy screenshot');
                        const response = await fetch(ss.dataUrl);
                        const blob = await response.blob();

                        if (navigator.clipboard && navigator.clipboard.write) {
                          await navigator.clipboard.write([
                            new ClipboardItem({ [blob.type]: blob })
                          ]);
                          console.log('[IssueCard] Successfully copied screenshot to clipboard');
                          toast.success('Image copied to clipboard');
                        } else {
                          console.warn('[IssueCard] Clipboard API not available');
                          toast.warning('Clipboard not available in this context');
                        }
                      } catch (err) {
                        console.error('[IssueCard] Failed to copy screenshot:', err);
                        if (err instanceof Error) {
                          console.error('[IssueCard] Screenshot copy error details:', {
                            message: err.message,
                            name: err.name,
                          });
                        }
                        toast.error('Failed to copy image');
                      }
                    }}
                    className="absolute -left-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white opacity-100 transition-opacity sm:h-4 sm:w-4 sm:-left-1 sm:-top-1 sm:opacity-0 sm:group-hover/thumb:opacity-100"
                    title="Copy image"
                  >
                    <ClipboardCopy className="h-4 w-4 sm:h-2.5 sm:w-2.5" />
                  </button>
                  <button
                    onClick={() => removeScreenshot(issue.id, ss.id)}
                    className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white opacity-100 transition-opacity sm:h-4 sm:w-4 sm:-right-1 sm:-top-1 sm:opacity-0 sm:group-hover/thumb:opacity-100"
                  >
                    <X className="h-4 w-4 sm:h-2.5 sm:w-2.5" />
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
                      console.log('[IssueCard] Attempting to copy preview image');
                      const response = await fetch(previewImage);
                      const blob = await response.blob();

                      if (navigator.clipboard && navigator.clipboard.write) {
                        await navigator.clipboard.write([
                          new ClipboardItem({ [blob.type]: blob })
                        ]);
                        console.log('[IssueCard] Successfully copied preview image to clipboard');
                        toast.success('Image copied to clipboard');
                      } else {
                        console.warn('[IssueCard] Clipboard API not available');
                        toast.warning('Clipboard not available in this context');
                      }
                    } catch (err) {
                      console.error('[IssueCard] Failed to copy preview image:', err);
                      if (err instanceof Error) {
                        console.error('[IssueCard] Preview copy error details:', {
                          message: err.message,
                          name: err.name,
                        });
                      }
                      toast.error('Failed to copy image');
                    }
                  }}
                  className="absolute -left-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 sm:h-8 sm:w-8"
                  title="Copy image"
                >
                  <ClipboardCopy className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 sm:h-8 sm:w-8"
                >
                  <X className="h-5 w-5 sm:h-4 sm:w-4" />
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
              className="w-full resize-none rounded border border-border bg-muted px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:py-2 sm:text-xs"
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
