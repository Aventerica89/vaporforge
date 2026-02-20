import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Copy, Check, Code2, ChevronDown, ChevronRight, Plus, Trash2, Package } from 'lucide-react';
import { componentCatalog, componentCategories } from '@/lib/generated/component-catalog';
import { usePlayground } from '@/hooks/usePlayground';
import { userComponentsApi } from '@/lib/api';
import { toast } from '@/hooks/useToast';
import type { ComponentEntry } from '@/lib/generated/component-catalog';
import type { UserComponentEntry } from '@/lib/api';

type DisplayEntry = ComponentEntry | UserComponentEntry;

function isUserEntry(entry: DisplayEntry): entry is UserComponentEntry {
  return (entry as UserComponentEntry).isCustom === true;
}

export function ComponentsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [installTarget, setInstallTarget] = useState<string | null>(null);
  const [installFileIndex, setInstallFileIndex] = useState(0);
  const [installCopiedFile, setInstallCopiedFile] = useState<number | null>(null);

  // User component state
  const [userComponents, setUserComponents] = useState<UserComponentEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const { insertCode } = usePlayground();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load user components on mount
  useEffect(() => {
    userComponentsApi.list()
      .then((res) => { if (res.success && res.data) setUserComponents(res.data); })
      .catch(() => {});
  }, []);

  // Focus name input when form opens
  useEffect(() => {
    if (showAddForm) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [showAddForm]);

  const allComponents: DisplayEntry[] = useMemo(
    () => [...componentCatalog, ...userComponents],
    [userComponents]
  );

  const allCategories = useMemo(() => {
    const extra = new Set(userComponents.map((c) => c.category));
    const base: string[] = [...componentCategories];
    extra.forEach((cat) => { if (!base.includes(cat)) base.push(cat); });
    return base;
  }, [userComponents]);

  const filtered = useMemo(() => {
    let items: DisplayEntry[];
    if (activeCategory === 'My Components') {
      items = userComponents;
    } else {
      items = activeCategory
        ? allComponents.filter((c) => c.category === activeCategory)
        : allComponents;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [searchQuery, activeCategory, allComponents, userComponents]);

  const handleCopy = useCallback(
    (entry: DisplayEntry) => {
      const text = entry.code || entry.name;
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(`Copied ${entry.name} to clipboard`);
    },
    []
  );

  const handleInsert = useCallback(
    (entry: DisplayEntry) => {
      if (!entry.code) return;
      insertCode(entry.code);
      toast.success(`Inserted ${entry.name} into active panel`);
    },
    [insertCode]
  );

  const handleInstallCopyFile = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setInstallCopiedFile(index);
    setTimeout(() => setInstallCopiedFile(null), 2000);
    toast.success('File copied to clipboard');
  }, []);

  const handleDelete = useCallback(async (id: string, name: string) => {
    try {
      await userComponentsApi.delete(id);
      setUserComponents((prev) => prev.filter((c) => c.id !== id));
      toast.success(`Removed ${name}`);
    } catch {
      toast.error('Failed to remove component');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!addName.trim() || !addCode.trim()) return;
    setAddSaving(true);
    try {
      const res = await userComponentsApi.save({
        name: addName.trim(),
        category: addCategory.trim() || 'Custom',
        description: addDescription.trim(),
        code: addCode.trim(),
        dependencies: [],
        tailwindClasses: [],
        type: 'snippet',
      });
      if (res.success && res.data) {
        setUserComponents((prev) => [res.data!, ...prev]);
        setShowAddForm(false);
        setAddName('');
        setAddCategory('');
        setAddDescription('');
        setAddCode('');
        toast.success('Component saved');
      }
    } catch {
      toast.error('Failed to save component');
    } finally {
      setAddSaving(false);
    }
  }, [addName, addCategory, addDescription, addCode]);

  const handleToggleInstall = useCallback((id: string) => {
    setInstallTarget((prev) => (prev === id ? null : id));
    setInstallFileIndex(0);
    setInstallCopiedFile(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Search + category filter */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-center sm:px-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search components..."
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
              (!activeCategory
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted')
            }
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
                (activeCategory === cat
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted')
              }
            >
              {cat}
            </button>
          ))}
          {/* My Components shortcut */}
          <button
            onClick={() => setActiveCategory(activeCategory === 'My Components' ? null : 'My Components')}
            className={
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
              (activeCategory === 'My Components'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted')
            }
          >
            My Components
          </button>
        </div>
      </div>

      {/* Add Component button */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 sm:px-4">
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} component{filtered.length !== 1 ? 's' : ''}
          {userComponents.length > 0 && ` · ${userComponents.length} custom`}
        </span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={
            'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
            (showAddForm
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground')
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add Component
        </button>
      </div>

      {/* Add Component form */}
      {showAddForm && (
        <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-3 py-3 sm:px-4">
          <div className="flex gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Component name *"
              maxLength={80}
              className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              placeholder="Category"
              list="category-suggestions"
              className="h-8 w-28 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <datalist id="category-suggestions">
              {allCategories.map((cat) => <option key={cat} value={cat} />)}
            </datalist>
          </div>
          <input
            type="text"
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <textarea
            value={addCode}
            onChange={(e) => setAddCode(e.target.value)}
            placeholder="Paste your component code here *"
            rows={5}
            className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 font-mono text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowAddForm(false); setAddName(''); setAddCategory(''); setAddDescription(''); setAddCode(''); }}
              className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!addName.trim() || !addCode.trim() || addSaving}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {addSaving ? 'Saving…' : 'Save Component'}
            </button>
          </div>
        </div>
      )}

      {/* Component list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 sm:px-4"
        style={{ overscrollBehavior: 'contain' }}
      >
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <Code2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No components match your search.</p>
            {activeCategory === 'My Components' && userComponents.length === 0 && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                Add your first component
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <ComponentCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                copied={copiedId === entry.id}
                showInstall={installTarget === entry.id}
                installFileIndex={installFileIndex}
                installCopiedFile={installCopiedFile}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onCopy={() => handleCopy(entry)}
                onInsert={() => handleInsert(entry)}
                onDelete={isUserEntry(entry) ? () => handleDelete(entry.id, entry.name) : undefined}
                onToggleInstall={() => handleToggleInstall(entry.id)}
                onInstallFileSelect={(i) => { setInstallFileIndex(i); setInstallCopiedFile(null); }}
                onInstallFileCopy={(content, i) => handleInstallCopyFile(content, i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ComponentCardProps {
  entry: DisplayEntry;
  expanded: boolean;
  copied: boolean;
  showInstall: boolean;
  installFileIndex: number;
  installCopiedFile: number | null;
  onToggle: () => void;
  onCopy: () => void;
  onInsert: () => void;
  onDelete?: () => void;
  onToggleInstall: () => void;
  onInstallFileSelect: (index: number) => void;
  onInstallFileCopy: (content: string, index: number) => void;
}

function ComponentCard({
  entry,
  expanded,
  copied,
  showInstall,
  installFileIndex,
  installCopiedFile,
  onToggle,
  onCopy,
  onInsert,
  onDelete,
  onToggleInstall,
  onInstallFileSelect,
  onInstallFileCopy,
}: ComponentCardProps) {
  const isApp = entry.type === 'app';
  const isCustom = isUserEntry(entry);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <button
        onClick={isApp ? onToggleInstall : onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50 sm:px-4"
        style={{ minHeight: 'var(--touch-target, 44px)' }}
      >
        {isApp ? (
          <Package className="h-4 w-4 shrink-0 text-primary/60" />
        ) : expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{entry.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {entry.category}
            </span>
            {isCustom && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Custom
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.description}</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {!isApp && (
            <>
              <button
                onClick={onCopy}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:h-7 sm:w-7"
                title="Copy code"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={onInsert}
                className="hidden rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors sm:block"
              >
                Use
              </button>
            </>
          )}
          {isApp && (
            <button
              onClick={onToggleInstall}
              className={
                'hidden rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:block ' +
                (showInstall ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20')
              }
            >
              Install Guide
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors sm:h-7 sm:w-7"
              title="Remove component"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </button>

      {/* Snippet code preview */}
      {!isApp && expanded && (
        <div className="border-t border-border bg-muted/20">
          <pre
            className="overflow-x-auto p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all sm:p-4"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {entry.code}
          </pre>
          {/* Mobile-only insert */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2 sm:hidden">
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onInsert}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Use in Panel
            </button>
          </div>
        </div>
      )}

      {/* App Install Guide */}
      {isApp && showInstall && entry.files && entry.files.length > 0 && (
        <div className="border-t border-border bg-muted/10">
          {/* Dependencies */}
          {entry.dependencies.length > 0 && (
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Install:
              </span>
              <code className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground">
                npm install {entry.dependencies.join(' ')}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('npm install ' + entry.dependencies.join(' ')).catch(() => {});
                  toast.success('Install command copied');
                }}
                className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy install command"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* File tabs */}
          <div className="flex gap-0 border-b border-border/50 overflow-x-auto">
            {entry.files.map((file, i) => (
              <button
                key={file.path}
                onClick={() => onInstallFileSelect(i)}
                className={
                  'shrink-0 px-3 py-1.5 text-xs font-mono transition-colors ' +
                  (installFileIndex === i
                    ? 'border-b-2 border-primary text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {file.path}
              </button>
            ))}
          </div>

          {/* Active file content */}
          {entry.files[installFileIndex] && (
            <div className="relative">
              <button
                onClick={() => onInstallFileCopy(entry.files![installFileIndex].content, installFileIndex)}
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {installCopiedFile === installFileIndex ? (
                  <><Check className="h-3 w-3 text-green-400" /> Copied</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy</>
                )}
              </button>
              <pre
                className="max-h-64 overflow-auto p-3 pt-8 text-xs font-mono text-muted-foreground whitespace-pre"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {entry.files[installFileIndex].content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
