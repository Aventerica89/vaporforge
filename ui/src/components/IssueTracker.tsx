import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, ClipboardCopy, ChevronDown, Search, Download, Upload, CheckSquare, Square, XCircle } from 'lucide-react';
import { useIssueTracker, buildMarkdown, formatIssue, uploadIssueScreenshots } from '@/hooks/useIssueTracker';
import { IssueCard } from '@/components/IssueCard';
import { toast } from '@/hooks/useToast';
import { validateImportData } from '@/lib/validation';
import type { Issue, IssueFilter } from '@/hooks/useIssueTracker';

const FILTER_TABS: { id: IssueFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bug', label: 'Bugs' },
  { id: 'error', label: 'Errors' },
  { id: 'feature', label: 'Features' },
  { id: 'suggestion', label: 'Ideas' },
  { id: 'resolved', label: 'Resolved' },
];

const ISSUE_TYPES: Issue['type'][] = ['bug', 'error', 'feature', 'suggestion'];
const ISSUE_SIZES: Issue['size'][] = ['S', 'M', 'L'];

export function IssueTracker() {
  const {
    issues,
    suggestions,
    isOpen,
    filter,
    closeTracker,
    setFilter,
    addIssue,
    reorderIssues,
    setSuggestions,
  } = useIssueTracker();

  // Search + add form state
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Issue['type']>('bug');
  const [size, setSize] = useState<Issue['size']>('M');
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drag state for reorder
  const dragIndex = useRef<number | null>(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTracker();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, closeTracker]);

  // Focus title input when form opens
  useEffect(() => {
    if (showForm) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [showForm]);

  const handleAddIssue = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addIssue({ title: trimmed, description: '', type, size });
    setTitle('');
    setShowForm(false);
  }, [title, type, size, addIssue]);

  const handleDragStart = useCallback((index: number) => {
    dragIndex.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      const fromIndex = dragIndex.current;
      if (fromIndex === null || fromIndex === toIndex) return;
      reorderIssues(fromIndex, toIndex);
      dragIndex.current = null;
    },
    [reorderIssues]
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCopySelected = useCallback(() => {
    const selected = issues.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;
    const md = selected.map((i) => formatIssue(i)).join('\n');
    navigator.clipboard.writeText(md).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [issues, selectedIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  if (!isOpen) return null;

  // Filter + search issues
  const query = searchQuery.toLowerCase().trim();
  const matchesSearch = (i: Issue) =>
    !query ||
    i.title.toLowerCase().includes(query) ||
    i.description.toLowerCase().includes(query);

  const filtered =
    filter === 'all'
      ? issues.filter((i) => !i.resolved && matchesSearch(i))
      : filter === 'resolved'
        ? issues.filter((i) => i.resolved && matchesSearch(i))
        : issues.filter((i) => i.type === filter && !i.resolved && matchesSearch(i));

  const openCount = issues.filter((i) => !i.resolved).length;
  const resolvedCount = issues.filter((i) => i.resolved).length;

  const handleExportMarkdown = async () => {
    try {
      // If items are selected, export those; otherwise export current filter view
      const toExport = selectedIds.size > 0
        ? issues.filter((i) => selectedIds.has(i.id))
        : filtered;

      const issuesWithUrls = await Promise.all(
        toExport.map((issue) => uploadIssueScreenshots(issue))
      );

      const md = buildMarkdown(issuesWithUrls, suggestions);
      await navigator.clipboard.writeText(md);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const label = selectedIds.size > 0
        ? `${toExport.length} selected issues`
        : 'filtered issues';
      toast.success(`Copied ${label} to clipboard`);
    } catch (err) {
      console.error('Failed to export markdown:', err);
      toast.error('Failed to copy markdown to clipboard');
    }
  };

  const handleExportJSON = () => {
    try {
      const timestamp = new Date().toISOString();
      const exportData = {
        issues,
        suggestions,
        filter,
        exportedAt: timestamp,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaporforge-issues-${timestamp.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Issues exported successfully');
    } catch (err) {
      console.error('Failed to export JSON:', err);
      toast.error('Failed to export issues');
    }
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content);

        // Validate the imported data structure and content
        const validation = validateImportData(parsedData);

        if (!validation.success) {
          console.error('Import validation errors:', validation.errors);
          toast.error(`Invalid import file: ${validation.errors?.[0] || 'Unknown error'}`);
          return;
        }

        // Data is validated and safe to import
        const { issues, suggestions, filter } = validation.data!;

        // Upload screenshots to VaporFiles so base64 data doesn't exceed
        // localStorage quota, then clear the dataUrl to keep persistence small.
        toast.success(`Importing ${issues.length} issue${issues.length === 1 ? '' : 's'}...`);
        const uploaded = await Promise.all(issues.map(uploadIssueScreenshots));
        const lightweight = uploaded.map((issue) => ({
          ...issue,
          screenshots: issue.screenshots.map((s) => ({
            ...s,
            // Keep dataUrl only if upload failed (no fileUrl)
            dataUrl: s.fileUrl ? '' : s.dataUrl,
          })),
        }));

        // Import the data
        useIssueTracker.setState({
          issues: lightweight,
          suggestions,
          filter,
        });

        // Sync to backend
        useIssueTracker.getState().syncToBackend();

        toast.success(`Successfully imported ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON format';
        console.error('Import error:', error);
        toast.error(`Failed to import file: ${message}`);
      }
    };
    reader.readAsText(file);

    // Reset input
    if (event.target) {
      event.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="flex h-full w-full flex-col"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-primary">
              Issue Tracker
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {openCount} open / {resolvedCount} done
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Copy MD — respects selection when active */}
            <button
              onClick={handleExportMarkdown}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2.5 text-xs transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5 ${
                selectedIds.size > 0
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              title={selectedIds.size > 0 ? `Copy ${selectedIds.size} selected as Markdown` : 'Copy all as Markdown'}
            >
              <ClipboardCopy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">
                {copied ? 'Copied!' : selectedIds.size > 0 ? `Copy ${selectedIds.size}` : 'Copy MD'}
              </span>
              <span className="sm:hidden">{copied ? '✓' : 'MD'}</span>
            </button>

            {/* Export JSON */}
            <button
              onClick={handleExportJSON}
              className="flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5"
              title="Export as JSON"
            >
              <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Import JSON */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5"
              title="Import from JSON"
            >
              <Upload className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />

            {/* Add button */}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex min-h-[44px] items-center gap-1 rounded-md bg-primary/10 px-3 py-2.5 text-xs text-primary hover:bg-primary/20 transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5"
            >
              <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>

            {/* Close */}
            <button
              onClick={closeTracker}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors sm:h-8 sm:w-8"
              aria-label="Close"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs + search */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5 sm:py-2">
          <div className="flex flex-wrap gap-2 sm:gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`min-h-[44px] rounded-md px-3 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-[11px] ${
                  filter === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-2 sm:h-3 sm:w-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="min-h-[44px] w-40 rounded border border-border bg-muted pl-9 pr-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:min-h-0 sm:w-36 sm:pl-7 sm:pr-2 sm:py-1 sm:text-xs"
            />
          </div>
        </div>

        {/* Multi-select action bar */}
        {filtered.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-1.5 bg-muted/20">
            {/* Select all toggle */}
            <button
              onClick={() => {
                const filteredIds = new Set(filtered.map((i) => i.id));
                const allSelected = filtered.every((i) => selectedIds.has(i.id));
                if (allSelected) {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    filteredIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedIds((prev) => new Set([...prev, ...filteredIds]));
                }
              }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title={filtered.every((i) => selectedIds.has(i.id)) ? 'Deselect all' : 'Select all'}
            >
              {filtered.every((i) => selectedIds.has(i.id)) ? (
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span className="font-display uppercase tracking-wider">
                {filtered.every((i) => selectedIds.has(i.id)) ? 'Deselect all' : 'Select all'}
              </span>
            </button>

            {/* Actions — only show when items selected */}
            {selectedIds.size > 0 && (
              <>
                <span className="text-[10px] text-muted-foreground/60">|</span>
                <span className="text-[10px] font-mono text-primary">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={handleCopySelected}
                  className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 transition-colors"
                >
                  <ClipboardCopy className="h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy MD'}
                </button>
                <button
                  onClick={handleClearSelection}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear selection"
                >
                  <XCircle className="h-3 w-3" />
                  Clear
                </button>
              </>
            )}
          </div>
        )}

        {/* Add form (inline) */}
        {showForm && (
          <div className="shrink-0 space-y-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddIssue();
                if (e.key === 'Escape') setShowForm(false);
              }}
              placeholder="Issue title..."
              className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:py-2 sm:text-sm"
            />
            <div className="flex items-center gap-3">
              {/* Type selector */}
              <div className="relative">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as Issue['type'])}
                  className="appearance-none min-h-[44px] rounded border border-border bg-background pl-3 pr-8 py-2.5 text-base text-foreground focus:border-primary focus:outline-none sm:min-h-0 sm:pl-2 sm:pr-6 sm:py-1 sm:text-xs"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:right-1 sm:h-3 sm:w-3" />
              </div>

              {/* Size chips */}
              <div className="flex gap-2">
                {ISSUE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`min-h-[44px] min-w-[44px] rounded px-3 py-2.5 text-sm font-bold transition-colors sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-0.5 sm:text-[10px] ${
                      size === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              <button
                onClick={handleAddIssue}
                disabled={!title.trim()}
                className="min-h-[44px] rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1 sm:text-xs"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Issue list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5" style={{ overscrollBehavior: 'contain' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground/60">
                {issues.length === 0
                  ? 'No issues yet. Click "Add" to create one.'
                  : 'No issues match this filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((issue, idx) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  index={idx}
                  selected={selectedIds.has(issue.id)}
                  onToggleSelect={handleToggleSelect}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}
        </div>

        {/* Claude suggestions */}
        <div
          className="shrink-0 border-t border-border px-4 pt-3 sm:px-5"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
        >
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Claude Suggestions
          </label>
          <textarea
            value={suggestions}
            onChange={(e) => setSuggestions(e.target.value)}
            placeholder="Paste Claude recommendations here..."
            rows={2}
            className="w-full min-h-[44px] resize-none rounded border border-border bg-muted px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:py-2 sm:text-xs"
          />
        </div>
      </div>
    </div>
  );
}
