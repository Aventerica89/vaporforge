import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, ClipboardCopy, ChevronDown, Search } from 'lucide-react';
import { useIssueTracker, buildMarkdown, uploadIssueScreenshots } from '@/hooks/useIssueTracker';
import { IssueCard } from '@/components/IssueCard';
import { toast } from '@/hooks/useToast';
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

export function IssuesTab() {
  const {
    issues,
    suggestions,
    filter,
    setFilter,
    addIssue,
    reorderIssues,
    setSuggestions,
  } = useIssueTracker();

  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Issue['type']>('bug');
  const [size, setSize] = useState<Issue['size']>('M');
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
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

  const handleExportMarkdown = async () => {
    try {
      const issuesWithUrls = await Promise.all(
        filtered.map((issue) => uploadIssueScreenshots(issue))
      );
      const md = buildMarkdown(issuesWithUrls, suggestions);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    } catch (err) {
      console.error('Failed to export:', err);
      toast.error('Failed to copy');
    }
  };

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

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          {openCount} open / {resolvedCount} done
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy MD'}</span>
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
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
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 w-32 rounded border border-border bg-muted pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:w-36"
          />
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-3 py-3 sm:px-4">
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
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Issue['type'])}
                className="appearance-none h-8 rounded border border-border bg-background pl-2 pr-7 text-xs focus:border-primary focus:outline-none"
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="flex gap-1">
              {ISSUE_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
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
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 sm:px-4" style={{ overscrollBehavior: 'contain' }}>
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
                selected={false}
                onToggleSelect={() => {}}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="shrink-0 border-t border-border px-3 py-2 sm:px-4">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Claude Suggestions
        </label>
        <textarea
          value={suggestions}
          onChange={(e) => setSuggestions(e.target.value)}
          placeholder="Paste Claude recommendations here..."
          rows={2}
          className="w-full resize-none rounded border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}
