// Static shadcn/ui component catalog for the Dev Playground
// Reference-only — these are copy-paste snippets, not runtime dependencies

export interface ComponentFile {
  path: string;
  content: string;
}

export interface ComponentEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  code: string;
  dependencies: string[];
  tailwindClasses: string[];
  type?: 'snippet' | 'app';
  files?: ComponentFile[];
  instructions?: string;
  setupScript?: string;
  agents?: string[];
}

// ─── Issue Tracker standalone file contents ───

const IT_HOOK = `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Issue {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'error' | 'feature' | 'suggestion';
  size: 'S' | 'M' | 'L';
  screenshots: Array<{ id: string; dataUrl: string }>;
  claudeNote?: string;
  resolved: boolean;
  createdAt: string;
}

export type IssueFilter = 'all' | 'bug' | 'error' | 'feature' | 'suggestion' | 'resolved';

interface IssueTrackerState {
  issues: Issue[];
  suggestions: string;
  isOpen: boolean;
  filter: IssueFilter;
  openTracker: () => void;
  closeTracker: () => void;
  setFilter: (filter: IssueFilter) => void;
  addIssue: (partial: Omit<Issue, 'id' | 'createdAt' | 'resolved' | 'screenshots'>) => void;
  updateIssue: (id: string, updates: Partial<Pick<Issue, 'title' | 'description' | 'type' | 'size'>>) => void;
  removeIssue: (id: string) => void;
  toggleResolved: (id: string) => void;
  reorderIssues: (fromIndex: number, toIndex: number) => void;
  addScreenshot: (issueId: string, screenshot: { id: string; dataUrl: string }) => void;
  removeScreenshot: (issueId: string, screenshotId: string) => void;
  setClaudeNote: (issueId: string, note: string) => void;
  setSuggestions: (text: string) => void;
}

export function buildMarkdown(issues: Issue[], suggestions: string): string {
  const lines = ['# Issue Tracker', '', 'Exported: ' + new Date().toISOString().slice(0, 10), ''];
  const open = issues.filter((i) => !i.resolved);
  const done = issues.filter((i) => i.resolved);
  if (open.length > 0) { lines.push('## Open', ''); open.forEach((i) => lines.push(formatIssue(i))); }
  if (done.length > 0) { lines.push('## Resolved', ''); done.forEach((i) => lines.push(formatIssue(i))); }
  if (suggestions.trim()) { lines.push('## Notes', '', suggestions.trim(), ''); }
  return lines.join('\\n');
}

export function formatIssue(issue: Issue): string {
  const check = issue.resolved ? 'x' : ' ';
  const lines = ['- [' + check + '] **[' + issue.type.toUpperCase() + '] [' + issue.size + ']** ' + issue.title];
  if (issue.description.trim()) lines.push('  > ' + issue.description.trim());
  if (issue.claudeNote?.trim()) lines.push('  - Note: ' + issue.claudeNote.trim());
  lines.push('');
  return lines.join('\\n');
}

export const useIssueTracker = create<IssueTrackerState>()(
  persist(
    (set) => ({
      issues: [],
      suggestions: '',
      isOpen: false,
      filter: 'all' as IssueFilter,
      openTracker: () => set({ isOpen: true }),
      closeTracker: () => set({ isOpen: false }),
      setFilter: (filter) => set({ filter }),
      addIssue: (partial) => {
        const issue: Issue = {
          ...partial,
          id: crypto.randomUUID(),
          screenshots: [],
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ issues: [issue, ...state.issues] }));
      },
      updateIssue: (id, updates) =>
        set((state) => ({ issues: state.issues.map((i) => (i.id === id ? { ...i, ...updates } : i)) })),
      removeIssue: (id) =>
        set((state) => ({ issues: state.issues.filter((i) => i.id !== id) })),
      toggleResolved: (id) =>
        set((state) => ({ issues: state.issues.map((i) => (i.id === id ? { ...i, resolved: !i.resolved } : i)) })),
      reorderIssues: (fromIndex, toIndex) =>
        set((state) => {
          const next = [...state.issues];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { issues: next };
        }),
      addScreenshot: (issueId, screenshot) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, screenshots: [...i.screenshots, screenshot] } : i
          ),
        })),
      removeScreenshot: (issueId, screenshotId) =>
        set((state) => ({
          issues: state.issues.map((i) =>
            i.id === issueId
              ? { ...i, screenshots: i.screenshots.filter((s) => s.id !== screenshotId) }
              : i
          ),
        })),
      setClaudeNote: (issueId, note) =>
        set((state) => ({ issues: state.issues.map((i) => (i.id === issueId ? { ...i, claudeNote: note } : i)) })),
      setSuggestions: (text) => set({ suggestions: text }),
    }),
    {
      name: 'issue-tracker',
      partialize: (state) => ({ issues: state.issues, suggestions: state.suggestions, filter: state.filter }),
    }
  )
);
`;

const IT_CARD = `import { useState, useCallback, useRef } from 'react';
import { GripVertical, ChevronDown, X, Trash2 } from 'lucide-react';
import { useIssueTracker } from '../hooks/useIssueTracker';
import type { Issue } from '../hooks/useIssueTracker';

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

export function IssueCard({ issue, index, onDragStart, onDragOver, onDrop }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingSize, setEditingSize] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { updateIssue, removeIssue, toggleResolved, addScreenshot, removeScreenshot, setClaudeNote } = useIssueTracker();

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  const handleImageFile = useCallback((file: File) => {
    if (!ALLOWED_TYPES.includes(file.type) || issue.screenshots.length >= 10) return;
    const reader = new FileReader();
    reader.onload = () => addScreenshot(issue.id, { id: crypto.randomUUID(), dataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }, [issue.id, issue.screenshots.length, addScreenshot]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (ALLOWED_TYPES.includes(file.type)) { e.preventDefault(); handleImageFile(file); }
    }
  }, [handleImageFile]);

  const handleDropImage = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) handleImageFile(file);
  }, [handleImageFile]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={'group rounded-lg border border-border bg-card/50 ' + (issue.resolved ? 'opacity-60' : '')}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button className="flex h-6 w-6 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => toggleResolved(issue.id)}
          className={'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ' + (issue.resolved ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}
          title={issue.resolved ? 'Mark unresolved' : 'Mark resolved'}
        />
        {editingType ? (
          <select value={issue.type} onChange={(e) => { updateIssue(issue.id, { type: e.target.value as Issue['type'] }); setEditingType(false); }} onBlur={() => setEditingType(false)} autoFocus className="shrink-0 rounded border border-primary bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <option value="bug">BUG</option><option value="error">ERROR</option><option value="feature">FEATURE</option><option value="suggestion">IDEA</option>
          </select>
        ) : (
          <button onClick={() => setEditingType(true)} className={'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + TYPE_COLORS[issue.type]}>{issue.type}</button>
        )}
        {editingSize ? (
          <select value={issue.size} onChange={(e) => { updateIssue(issue.id, { size: e.target.value as Issue['size'] }); setEditingSize(false); }} onBlur={() => setEditingSize(false)} autoFocus className="shrink-0 rounded border border-primary bg-card px-1.5 py-0.5 text-[10px] font-bold text-primary">
            <option>S</option><option>M</option><option>L</option>
          </select>
        ) : (
          <button onClick={() => setEditingSize(true)} className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ' + SIZE_COLORS[issue.size]}>{issue.size}</button>
        )}
        <button onClick={() => setExpanded(!expanded)} className={'flex-1 truncate text-left text-sm ' + (issue.resolved ? 'line-through text-muted-foreground' : 'text-foreground')}>{issue.title}</button>
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 text-muted-foreground hover:text-foreground">
          <ChevronDown className={'h-3.5 w-3.5 transition-transform ' + (expanded ? 'rotate-180' : '')} />
        </button>
        <button onClick={() => removeIssue(issue.id)} className="shrink-0 p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" title="Delete">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-border/50 px-3 py-3" onPaste={handlePaste}>
          <textarea
            value={issue.description}
            onChange={(e) => updateIssue(issue.id, { description: e.target.value })}
            placeholder="Describe the issue..."
            rows={4}
            className="w-full resize-y rounded border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div ref={dropZoneRef} onDragOver={(e) => e.preventDefault()} onDrop={handleDropImage} className="rounded border-2 border-dashed border-border/50 px-3 py-2 text-center text-xs text-muted-foreground/60">
            Drop or paste images here
          </div>
          {issue.screenshots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {issue.screenshots.map((ss) => (
                <div key={ss.id} className="group/thumb relative">
                  <img src={ss.dataUrl} alt="Screenshot" className="h-16 w-16 rounded border border-border object-cover" />
                  <button onClick={() => removeScreenshot(issue.id, ss.id)} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover/thumb:opacity-100">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Note</label>
            <textarea value={issue.claudeNote || ''} onChange={(e) => setClaudeNote(issue.id, e.target.value)} placeholder="Notes or AI-suggested fix..." rows={2} className="w-full resize-none rounded border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
          <div className="text-[10px] text-muted-foreground/50">Created {new Date(issue.createdAt).toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}
`;

const IT_MAIN = `import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, ClipboardCopy, Search } from 'lucide-react';
import { useIssueTracker, buildMarkdown, formatIssue } from '../hooks/useIssueTracker';
import { IssueCard } from './IssueCard';
import type { Issue, IssueFilter } from '../hooks/useIssueTracker';

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
  const { issues, suggestions, isOpen, filter, closeTracker, setFilter, addIssue, reorderIssues, setSuggestions } = useIssueTracker();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Issue['type']>('bug');
  const [size, setSize] = useState<Issue['size']>('M');
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTracker(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, closeTracker]);

  useEffect(() => { if (showForm) setTimeout(() => titleRef.current?.focus(), 50); }, [showForm]);

  const handleAddIssue = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addIssue({ title: trimmed, description: '', type, size });
    setTitle('');
    setShowForm(false);
  }, [title, type, size, addIssue]);

  const handleDragStart = useCallback((index: number) => { dragIndex.current = index; }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((toIndex: number) => {
    const fromIndex = dragIndex.current;
    if (fromIndex === null || fromIndex === toIndex) return;
    reorderIssues(fromIndex, toIndex);
    dragIndex.current = null;
  }, [reorderIssues]);

  const handleCopyMarkdown = useCallback(async () => {
    const toExport = filtered.length > 0 ? filtered : issues;
    const md = buildMarkdown(toExport, suggestions);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [issues, suggestions]);

  if (!isOpen) return null;

  const query = searchQuery.toLowerCase().trim();
  const matchesSearch = (i: Issue) => !query || i.title.toLowerCase().includes(query) || i.description.toLowerCase().includes(query);
  const filtered = filter === 'resolved'
    ? issues.filter((i) => i.resolved && matchesSearch(i))
    : filter === 'all'
      ? issues.filter((i) => !i.resolved && matchesSearch(i))
      : issues.filter((i) => i.type === filter && !i.resolved && matchesSearch(i));
  const openCount = issues.filter((i) => !i.resolved).length;
  const resolvedCount = issues.filter((i) => i.resolved).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-full w-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-primary">Issue Tracker</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{openCount} open / {resolvedCount} done</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopyMarkdown} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy MD'}
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
            <button onClick={closeTracker} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map((tab) => (
              <button key={tab.id} onClick={() => setFilter(tab.id)} className={'min-h-0 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors ' + (filter === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-36 rounded border border-border bg-muted pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
        </div>
        {showForm && (
          <div className="shrink-0 space-y-3 border-b border-border bg-muted/30 px-4 py-4">
            <input ref={titleRef} type="text" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddIssue(); if (e.key === 'Escape') setShowForm(false); }} placeholder="Issue title..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex items-center gap-3">
              <select value={type} onChange={(e) => setType(e.target.value as Issue['type'])} className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none">
                {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <div className="flex gap-1">
                {ISSUE_SIZES.map((s) => (
                  <button key={s} onClick={() => setSize(s)} className={'rounded px-2 py-0.5 text-xs font-bold transition-colors ' + (size === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{s}</button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={handleAddIssue} disabled={!title.trim()} className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50">Create</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ overscrollBehavior: 'contain' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground/60">{issues.length === 0 ? 'No issues yet. Click "Add" to create one.' : 'No issues match this filter.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((issue, idx) => (
                <IssueCard key={issue.id} issue={issue} index={idx} onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-4 py-3">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes / Claude Suggestions</label>
          <textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} placeholder="Paste Claude recommendations here..." rows={2} className="w-full resize-none rounded border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
    </div>
  );
}
`;

export const componentCatalog: ComponentEntry[] = [
  // ─── Form ───
  {
    id: 'button',
    name: 'Button',
    category: 'Form',
    description: 'Clickable button with variants: default, outline, ghost, destructive.',
    code: `function Button({ children, variant = 'default', size = 'md', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  const sizes = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-11 px-8 text-base',
  };
  return (
    <button className={\`\${base} \${variants[variant]} \${sizes[size]}\`} {...props}>
      {children}
    </button>
  );
}`,
    dependencies: [],
    tailwindClasses: ['bg-primary', 'text-primary-foreground', 'rounded-md'],
  },
  {
    id: 'input',
    name: 'Input',
    category: 'Form',
    description: 'Text input field with focus ring and placeholder styling.',
    code: `function Input({ className = '', ...props }) {
  return (
    <input
      className={\`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'rounded-md'],
  },
  {
    id: 'textarea',
    name: 'Textarea',
    category: 'Form',
    description: 'Multi-line text area with consistent styling.',
    code: `function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={\`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'min-h-[80px]'],
  },
  {
    id: 'select',
    name: 'Select',
    category: 'Form',
    description: 'Native select dropdown with custom styling.',
    code: `function Select({ children, className = '', ...props }) {
  return (
    <select
      className={\`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    >
      {children}
    </select>
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'h-10'],
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    category: 'Form',
    description: 'Checkbox with label layout.',
    code: `function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}`,
    dependencies: [],
    tailwindClasses: ['h-4', 'w-4', 'rounded', 'border-input'],
  },
  {
    id: 'toggle',
    name: 'Toggle',
    category: 'Form',
    description: 'iOS-style toggle switch.',
    code: `function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={\`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors \${
        checked ? 'bg-primary' : 'bg-muted'
      }\`}
    >
      <span
        className={\`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform \${
          checked ? 'translate-x-5' : 'translate-x-0'
        }\`}
      />
    </button>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-primary', 'bg-muted'],
  },

  // ─── Layout ───
  {
    id: 'card',
    name: 'Card',
    category: 'Layout',
    description: 'Container card with header, content, and optional footer.',
    code: `function Card({ title, description, children, footer }) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {(title || description) && (
        <div className="flex flex-col space-y-1.5 p-6">
          {title && <h3 className="text-2xl font-semibold leading-none tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="p-6 pt-0">{children}</div>
      {footer && <div className="flex items-center p-6 pt-0">{footer}</div>}
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-lg', 'border', 'bg-card', 'shadow-sm'],
  },
  {
    id: 'separator',
    name: 'Separator',
    category: 'Layout',
    description: 'Horizontal or vertical divider line.',
    code: `function Separator({ orientation = 'horizontal', className = '' }) {
  return (
    <div
      role="separator"
      className={\`shrink-0 bg-border \${
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'
      } \${className}\`}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['bg-border', 'h-px', 'w-full'],
  },
  {
    id: 'aspect-ratio',
    name: 'Aspect Ratio',
    category: 'Layout',
    description: 'Container that maintains a fixed aspect ratio.',
    code: `function AspectRatio({ ratio = 16 / 9, children }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: \`\${100 / ratio}%\` }}>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['relative', 'absolute', 'inset-0'],
  },

  // ─── Data Display ───
  {
    id: 'badge',
    name: 'Badge',
    category: 'Data Display',
    description: 'Small label/tag with color variants.',
    code: `function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input text-foreground',
  };
  return (
    <span className={\`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors \${variants[variant]}\`}>
      {children}
    </span>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'px-2.5', 'py-0.5', 'text-xs'],
  },
  {
    id: 'avatar',
    name: 'Avatar',
    category: 'Data Display',
    description: 'Circular avatar with image fallback to initials.',
    code: `function Avatar({ src, alt, fallback, size = 'md' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };
  return (
    <div className={\`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted \${sizes[size]}\`}>
      {src ? (
        <img src={src} alt={alt} className="aspect-square h-full w-full object-cover" />
      ) : (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-muted', 'aspect-square'],
  },
  {
    id: 'table',
    name: 'Table',
    category: 'Data Display',
    description: 'Responsive data table with header, body, and striped rows.',
    code: `function Table({ columns, data }) {
  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b border-border transition-colors">
            {columns.map((col) => (
              <th key={col.key} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border transition-colors hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col.key} className="p-4 align-middle">{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableDemo() {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
  ];
  const data = [
    { name: 'Alice', role: 'Designer', status: 'Active' },
    { name: 'Bob', role: 'Engineer', status: 'Inactive' },
    { name: 'Carol', role: 'PM', status: 'Active' },
  ];
  return <Table columns={columns} data={data} />;
}`,
    dependencies: [],
    tailwindClasses: ['border-b', 'border-border', 'hover:bg-muted/50'],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    category: 'Data Display',
    description: 'Loading placeholder with shimmer animation.',
    code: `function Skeleton({ className = '' }) {
  return (
    <div className={\`animate-pulse rounded-md bg-muted \${className}\`} />
  );
}

// Usage:
// <Skeleton className="h-4 w-[250px]" />
// <Skeleton className="h-12 w-full rounded-lg" />`,
    dependencies: [],
    tailwindClasses: ['animate-pulse', 'rounded-md', 'bg-muted'],
  },

  // ─── Feedback ───
  {
    id: 'alert',
    name: 'Alert',
    category: 'Feedback',
    description: 'Alert banner with icon, title, and description.',
    code: `function Alert({ title, children, variant = 'default' }) {
  const variants = {
    default: 'bg-background text-foreground border-border',
    destructive: 'border-destructive/50 text-destructive bg-destructive/5',
    success: 'border-green-500/50 text-green-600 bg-green-500/5',
    warning: 'border-yellow-500/50 text-yellow-600 bg-yellow-500/5',
  };
  return (
    <div role="alert" className={\`relative w-full rounded-lg border p-4 \${variants[variant]}\`}>
      {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
      <div className="text-sm [&_p]:leading-relaxed">{children}</div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-lg', 'border', 'p-4'],
  },
  {
    id: 'progress',
    name: 'Progress',
    category: 'Feedback',
    description: 'Linear progress bar with percentage.',
    code: `function Progress({ value = 0, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: \`\${pct}%\` }}
      />
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-secondary', 'bg-primary'],
  },
  {
    id: 'spinner',
    name: 'Spinner',
    category: 'Feedback',
    description: 'Animated loading spinner.',
    code: `function Spinner({ size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <svg className={\`animate-spin \${sizes[size]} text-primary\`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}`,
    dependencies: [],
    tailwindClasses: ['animate-spin', 'text-primary'],
  },

  // ─── Navigation ───
  {
    id: 'tabs',
    name: 'Tabs',
    category: 'Navigation',
    description: 'Horizontal tab navigation with active indicator.',
    code: `function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={\`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all \${
            activeTab === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'hover:text-foreground'
          }\`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TabsDemo() {
  const [active, setActive] = React.useState('account');
  const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'password', label: 'Password' },
    { id: 'settings', label: 'Settings' },
  ];
  return <Tabs tabs={tabs} activeTab={active} onTabChange={setActive} />;
}`,
    dependencies: [],
    tailwindClasses: ['rounded-md', 'bg-muted', 'shadow-sm'],
  },
  {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    category: 'Navigation',
    description: 'Breadcrumb trail for hierarchical navigation.',
    code: `function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/40">/</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-foreground transition-colors">{item.label}</a>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function BreadcrumbDemo() {
  const items = [
    { label: 'Home', href: '/' },
    { label: 'Components', href: '/components' },
    { label: 'Breadcrumb' },
  ];
  return <Breadcrumb items={items} />;
}`,
    dependencies: [],
    tailwindClasses: ['text-sm', 'text-muted-foreground'],
  },

  // ─── Overlay ───
  {
    id: 'dialog',
    name: 'Dialog',
    category: 'Overlay',
    description: 'Modal dialog with backdrop, header, and close button.',
    code: `function Dialog({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ padding: '16px' }}>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        Open Dialog
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Example Dialog">
        <p style={{ color: '#374151', fontSize: '14px', marginBottom: '16px' }}>
          This is the dialog content. You can add any content here.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
          <button onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Confirm</button>
        </div>
      </Dialog>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['fixed', 'inset-0', 'z-50', 'backdrop-blur-sm'],
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'Overlay',
    description: 'Hover tooltip using CSS-only positioning.',
    code: `function Tooltip({ children, content }) {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap border border-border">
        {content}
      </div>
    </div>
  );
}

function TooltipDemo() {
  return (
    <div style={{ padding: '48px 16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Tooltip content="Save your work">
        <button style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Save</button>
      </Tooltip>
      <Tooltip content="Delete this item permanently">
        <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
      </Tooltip>
      <Tooltip content="Share with your team">
        <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Share</button>
      </Tooltip>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['group', 'relative', 'bg-popover', 'shadow-md'],
  },
  {
    id: 'sheet',
    name: 'Sheet',
    category: 'Overlay',
    description: 'Slide-in side panel (drawer) from any edge.',
    code: `function Sheet({ open, onClose, side = 'right', children }) {
  if (!open) return null;
  const positions = {
    left: 'inset-y-0 left-0',
    right: 'inset-y-0 right-0',
    top: 'inset-x-0 top-0',
    bottom: 'inset-x-0 bottom-0',
  };
  const sizes = {
    left: 'w-3/4 max-w-sm h-full',
    right: 'w-3/4 max-w-sm h-full',
    top: 'h-1/3 w-full',
    bottom: 'h-1/3 w-full',
  };
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className={\`fixed \${positions[side]} \${sizes[side]} border-border bg-background p-6 shadow-lg\`}>
        {children}
      </div>
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ padding: '16px' }}>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        Open Sheet
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="right">
        <h3 style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>Sheet Title</h3>
        <p style={{ color: '#374151', fontSize: '14px', marginBottom: '16px' }}>
          This is the sheet content area. Add navigation, settings, or forms here.
        </p>
        <button
          onClick={() => setOpen(false)}
          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          Close
        </button>
      </Sheet>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['fixed', 'z-50', 'bg-background', 'shadow-lg'],
  },

  // ─── App Components ───
  {
    id: 'issue-tracker-app',
    name: 'Issue Tracker',
    category: 'App Components',
    type: 'app' as const,
    description: 'Full issue tracker with bug/feature tracking, drag reorder, screenshots, and localStorage persistence via Zustand.',
    code: '',
    dependencies: ['zustand', 'lucide-react'],
    tailwindClasses: [],
    files: [
      { path: 'hooks/useIssueTracker.ts', content: IT_HOOK },
      { path: 'components/IssueCard.tsx', content: IT_CARD },
      { path: 'components/IssueTracker.tsx', content: IT_MAIN },
    ],
  },
];

export const componentCategories = [
  'Form',
  'Layout',
  'Data Display',
  'Feedback',
  'Navigation',
  'Overlay',
  'App Components',
] as const;
