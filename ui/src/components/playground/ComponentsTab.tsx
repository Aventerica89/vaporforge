import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search, Copy, Check, Code2, ChevronDown, ChevronRight,
  Plus, Trash2, Package, Sparkles, Terminal, BookOpen, Bot, Eye,
} from 'lucide-react';
import { componentCatalog, componentCategories } from '@/lib/generated/component-catalog';
import { usePlayground } from '@/hooks/usePlayground';
import { userComponentsApi } from '@/lib/api';
import { toast } from '@/hooks/useToast';
import type { ComponentEntry } from '@/lib/generated/component-catalog';
import type { UserComponentEntry, ComponentDraft } from '@/lib/api';

type DisplayEntry = ComponentEntry | UserComponentEntry;

function isUserEntry(entry: DisplayEntry): entry is UserComponentEntry {
  return (entry as UserComponentEntry).isCustom === true;
}

// ─── Generate Form ───────────────────────────────────────────────────────────

interface GenerateFormProps {
  allCategories: string[];
  onSaved: (entry: UserComponentEntry) => void;
  onClose: () => void;
}

function GenerateForm({ allCategories, onSaved, onClose }: GenerateFormProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ComponentDraft | null>(null);
  const [saving, setSaving] = useState(false);
  // Editable draft fields
  const [draftName, setDraftName] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setDraft(null);
    try {
      const res = await userComponentsApi.generate(prompt.trim());
      if (res.success && res.data) {
        setDraft(res.data);
        setDraftName(res.data.name);
        setDraftCategory(res.data.category);
        setDraftDescription(res.data.description);
      } else {
        toast.error(res.error ?? 'Generation failed');
      }
    } catch {
      toast.error('Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload: Omit<UserComponentEntry, 'id' | 'isCustom' | 'createdAt'> = {
        ...draft,
        name: draftName.trim() || draft.name,
        category: draftCategory.trim() || draft.category,
        description: draftDescription.trim() || draft.description,
      };
      const res = await userComponentsApi.save(payload);
      if (res.success && res.data) {
        onSaved(res.data);
        toast.success(`Saved "${draftName || draft.name}"`);
        onClose();
      }
    } catch {
      toast.error('Failed to save component');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-muted/20 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Generate with AI</span>
        <button onClick={onClose} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what you want, or paste existing code to package it into the registry..."
        rows={4}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
        }}
      />

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Cmd+Enter to generate</span>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || loading}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? (
            <><span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground border-t-transparent" /> Generating…</>
          ) : (
            <><Sparkles className="h-3 w-3" /> Generate</>
          )}
        </button>
      </div>

      {/* Draft preview */}
      {draft && (
        <div className="mt-2 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
            Generated — review and save
          </p>
          <div className="flex gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
              placeholder="Name"
            />
            <input
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              list="gen-category-suggestions"
              className="h-7 w-28 rounded border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
              placeholder="Category"
            />
            <datalist id="gen-category-suggestions">
              {allCategories.map((cat) => <option key={cat} value={cat} />)}
            </datalist>
          </div>
          <input
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
            placeholder="Description"
          />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">{draft.type}</span>
            {draft.type === 'app' && draft.files && (
              <span>{draft.files.length} file{draft.files.length !== 1 ? 's' : ''}</span>
            )}
            {draft.dependencies.length > 0 && (
              <span className="font-mono">{draft.dependencies.join(', ')}</span>
            )}
          </div>
          {draft.instructions && (
            <p className="text-[10px] text-muted-foreground line-clamp-2">{draft.instructions}</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to My Components'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Form ────────────────────────────────────────────────────────────────

interface AddFormProps {
  allCategories: string[];
  onSaved: (entry: UserComponentEntry) => void;
  onClose: () => void;
}

function AddForm({ allCategories, onSaved, onClose }: AddFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [setupScript, setSetupScript] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    try {
      const res = await userComponentsApi.save({
        name: name.trim(),
        category: category.trim() || 'Custom',
        description: description.trim(),
        code: code.trim(),
        dependencies: [],
        tailwindClasses: [],
        type: 'snippet',
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(setupScript.trim() ? { setupScript: setupScript.trim() } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      });
      if (res.success && res.data) {
        onSaved(res.data);
        toast.success('Component saved');
        onClose();
      }
    } catch {
      toast.error('Failed to save component');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2 mb-1">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Add Component</span>
        <button onClick={onClose} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
      <div className="flex gap-2">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Component name *"
          maxLength={80}
          className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          list="add-category-suggestions"
          className="h-8 w-28 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <datalist id="add-category-suggestions">
          {allCategories.map((cat) => <option key={cat} value={cat} />)}
        </datalist>
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="Source URL (optional) — where you got this component"
        type="url"
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Component code *"
        rows={5}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 font-mono text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <input
        value={setupScript}
        onChange={(e) => setSetupScript(e.target.value)}
        placeholder="Setup script (optional) — e.g. npm install zustand"
        className="h-8 w-full rounded border border-border bg-background px-2 font-mono text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Usage instructions (optional) — props, gotchas, setup notes"
        rows={2}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !code.trim() || saving}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Component'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export function ComponentsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [installTarget, setInstallTarget] = useState<string | null>(null);
  const [installFileIndex, setInstallFileIndex] = useState(0);
  const [installCopiedFile, setInstallCopiedFile] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<'none' | 'add' | 'generate'>('none');
  const [userComponents, setUserComponents] = useState<UserComponentEntry[]>([]);

  const { insertCode } = usePlayground();

  useEffect(() => {
    userComponentsApi.list()
      .then((res) => { if (res.success && res.data) setUserComponents(res.data); })
      .catch(() => {});
  }, []);

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
    let items: DisplayEntry[] =
      activeCategory === 'My Components'
        ? userComponents
        : activeCategory
          ? allComponents.filter((c) => c.category === activeCategory)
          : allComponents;
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

  const handleCopy = useCallback((entry: DisplayEntry) => {
    navigator.clipboard.writeText(entry.code || entry.name).catch(() => {});
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success(`Copied ${entry.name} to clipboard`);
  }, []);

  const handleInsert = useCallback((entry: DisplayEntry) => {
    if (!entry.code) return;
    insertCode(entry.code);
    toast.success(`Inserted ${entry.name} into active panel`);
  }, [insertCode]);

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

  const handleToggleInstall = useCallback((id: string) => {
    setInstallTarget((prev) => (prev === id ? null : id));
    setInstallFileIndex(0);
    setInstallCopiedFile(null);
  }, []);

  const handleComponentSaved = useCallback((entry: UserComponentEntry) => {
    setUserComponents((prev) => [entry, ...prev]);
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
            className={'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
              (!activeCategory ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
                (activeCategory === cat ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setActiveCategory(activeCategory === 'My Components' ? null : 'My Components')}
            className={'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ' +
              (activeCategory === 'My Components' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
          >
            My Components
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 sm:px-4">
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} component{filtered.length !== 1 ? 's' : ''}
          {userComponents.length > 0 && ` · ${userComponents.length} custom`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActivePanel(activePanel === 'generate' ? 'none' : 'generate')}
            className={'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
              (activePanel === 'generate'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generate</span>
          </button>
          <button
            onClick={() => setActivePanel(activePanel === 'add' ? 'none' : 'add')}
            className={'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
              (activePanel === 'add'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      {/* Forms */}
      {activePanel === 'generate' && (
        <GenerateForm
          allCategories={allCategories}
          onSaved={handleComponentSaved}
          onClose={() => setActivePanel('none')}
        />
      )}
      {activePanel === 'add' && (
        <AddForm
          allCategories={allCategories}
          onSaved={handleComponentSaved}
          onClose={() => setActivePanel('none')}
        />
      )}

      {/* Component list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 sm:px-4" style={{ overscrollBehavior: 'contain' }}>
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <Code2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No components match your search.</p>
            {activeCategory === 'My Components' && userComponents.length === 0 && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setActivePanel('generate')}
                  className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Generate one
                </button>
                <button
                  onClick={() => setActivePanel('add')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add manually
                </button>
              </div>
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

// ─── Preview HTML builder ─────────────────────────────────────────────────────

function buildPreviewHtml(code: string): string {
  // Strip all import statements (single and multiline)
  const noImports = code.replace(/import[\s\S]*?from\s+['"][^'"]+['"]\s*;?/g, '').trim();

  // Strip export keywords so functions/consts become local
  const cleaned = noImports
    .replace(/export\s+default\s+function\s+/g, 'function ')
    .replace(/export\s+default\s+class\s+/g, 'class ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+class\s+/g, 'class ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+type\s+[^;]+;/g, '')
    .replace(/export\s+interface\s+\w+[^{]*\{[^}]*\}/gs, '');

  // Find last uppercase-starting function or const — most likely the root component
  const matches = [...cleaned.matchAll(/(?:^|\n)\s*(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g)];
  const componentName = matches.length > 0 ? matches[matches.length - 1][1] : null;

  const renderCall = componentName
    ? `try { root.render(React.createElement(${componentName})); } catch(e) { root.render(React.createElement('pre', {style:{color:'#f87171',fontSize:'12px',whiteSpace:'pre-wrap'}}, e.message)); }`
    : `root.render(React.createElement('p', {style:{color:'#9ca3af',fontSize:'12px'}}, 'No component found to render.'))`;

  // Detect names already declared in component code — skip stubs for those to avoid
  // "Identifier X has already been declared" SyntaxError when component ships its own Button etc.
  const defined = new Set(
    [...cleaned.matchAll(/\b(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_$]*)/g)].map(m => m[1])
  );
  const s = (name: string, stub: string) => defined.has(name) ? '' : stub;

  const shadcnStubs = [
    s('Button', `const Button = ({ children, className = '', variant = 'default', size = 'default', onClick, disabled, type: btnType, ...p }) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none';
    const v = variant === 'outline' ? 'border border-gray-600 text-gray-200 hover:bg-gray-800'
            : variant === 'ghost'   ? 'text-gray-300 hover:bg-gray-800'
            : variant === 'destructive' ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-indigo-600 text-white hover:bg-indigo-700';
    const sz = size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-11 px-8 text-base' : 'h-9 px-4 text-sm';
    return React.createElement('button', { type: btnType || 'button', className: cn(base,v,sz,className), onClick, disabled, ...p }, children);
  };`),
    s('Input', `const Input = ({ className = '', ...p }) =>
    React.createElement('input', { className: cn('flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-1 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500', className), ...p });`),
    s('Badge', `const Badge = ({ children, className = '', variant = 'default' }) => {
    const bv = variant === 'secondary' ? 'bg-gray-700 text-gray-300' : variant === 'destructive' ? 'bg-red-900 text-red-300' : 'bg-indigo-900 text-indigo-300';
    return React.createElement('span', { className: cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', bv, className) }, children);
  };`),
    s('Card', `const Card = ({ children, className = '' }) =>
    React.createElement('div', { className: cn('rounded-lg border border-gray-700 bg-gray-900 text-gray-100 shadow-sm', className) }, children);`),
    s('CardHeader', `const CardHeader = ({ children, className = '' }) =>
    React.createElement('div', { className: cn('flex flex-col space-y-1.5 p-6', className) }, children);`),
    s('CardTitle', `const CardTitle = ({ children, className = '' }) =>
    React.createElement('h3', { className: cn('text-lg font-semibold', className) }, children);`),
    s('CardContent', `const CardContent = ({ children, className = '' }) =>
    React.createElement('div', { className: cn('p-6 pt-0', className) }, children);`),
    s('CardFooter', `const CardFooter = ({ children, className = '' }) =>
    React.createElement('div', { className: cn('flex items-center p-6 pt-0', className) }, children);`),
    s('Label', `const Label = ({ children, className = '', htmlFor }) =>
    React.createElement('label', { className: cn('text-sm font-medium text-gray-200', className), htmlFor }, children);`),
    s('Textarea', `const Textarea = ({ className = '', ...p }) =>
    React.createElement('textarea', { className: cn('flex min-h-[80px] w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none', className), ...p });`),
    s('Separator', `const Separator = ({ className = '' }) =>
    React.createElement('div', { className: cn('h-px bg-gray-700', className) });`),
    s('Switch', `const Switch = ({ checked, onCheckedChange, ...p }) =>
    React.createElement('button', { role:'switch', 'aria-checked': checked, onClick:() => onCheckedChange?.(!checked),
      className: cn('relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors', checked ? 'bg-indigo-600' : 'bg-gray-700'), ...p },
      React.createElement('span', { className: cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform', checked ? 'translate-x-4' : 'translate-x-0') })
    );`),
    s('Slider', `const Slider = ({ value = [50], onValueChange, min = 0, max = 100, step = 1, className = '' }) =>
    React.createElement('input', { type:'range', value:value[0], min, max, step,
      onChange:(e) => onValueChange?.([Number(e.target.value)]),
      className: cn('w-full accent-indigo-500', className) });`),
  ].filter(Boolean).join('\n  ');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.addEventListener('error',function(e){if(e.message&&/\bp\d+\b is not defined/.test(e.message))e.preventDefault();},true);</script>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<style>
  *{box-sizing:border-box}
  body{
    margin:0;padding:24px;
    background:#111113;
    color:#e5e7eb;
    font-family:system-ui,sans-serif;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:100vh;
  }
  #root{
    width:100%;
    max-width:680px;
  }
</style>
</head><body>
<div id="root"></div>
<script type="text/babel" data-presets="typescript,react">
  // React hooks as locals
  const { useState, useEffect, useRef, useCallback, useMemo,
          useContext, createContext, forwardRef, memo, Fragment } = React;

  // cn / clsx stub
  const cn = (...a) => a.filter(Boolean).join(' ');
  const clsx = cn;

  // Lucide icon stub — renders a generic inline SVG box
  const _makeIcon = () => (({ className = '', size = 16, strokeWidth = 2, ...p }) =>
    React.createElement('svg', { xmlns:'http://www.w3.org/2000/svg', width:size, height:size,
      viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth, className, ...p },
      React.createElement('rect', { x:3, y:3, width:18, height:18, rx:2 })
    ));
  const _iconProxy = new Proxy({}, { get: () => _makeIcon() });
  const { Check: _C, X: _X, Plus: _P, Search: _S, Trash2: _T,
          ChevronDown: _CD, ChevronRight: _CR, ChevronUp: _CU,
          AlertCircle: _AC, Info: _I, Star: _St, Heart: _H,
          Settings: _Se, User: _U, Home: _Ho, Bell: _Be,
          Copy: _Co, Eye: _Ey, Edit: _Ed, Save: _Sv,
          Calendar: _Ca, Clock: _Cl, Mail: _Ma, Phone: _Ph } = _iconProxy;

  // toast / sonner stub
  const toast = { success: () => {}, error: () => {}, info: () => {} };

  // shadcn-style stubs — skipped for names already declared in the component
  ${shadcnStubs}

  // --- component code ---
  ${cleaned}
  // --- end ---

  const root = ReactDOM.createRoot(document.getElementById('root'));
  ${renderCall}
</script>
</body></html>`;
}

// ─── ComponentCard ────────────────────────────────────────────────────────────

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

type InstallTab = 'files' | 'instructions';

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
  const [installTab, setInstallTab] = useState<InstallTab>('files');
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const hasInstructions = Boolean(entry.instructions);
  const hasAgents = Array.isArray(entry.agents) && entry.agents.length > 0;

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
            {hasInstructions && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400/80" title="Has instructions">
                docs
              </span>
            )}
            {hasAgents && (
              <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-400/80" title="Includes agents">
                agents
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
                {copied
                  ? <Check className="h-3.5 w-3.5 text-green-400" />
                  : <Copy className="h-3.5 w-3.5" />}
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
              className={'hidden rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:block ' +
                (showInstall
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary hover:bg-primary/20')}
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

      {/* Snippet: code + optional extras */}
      {!isApp && expanded && (
        <div className="border-t border-border bg-muted/20">
          {/* Code / Preview toggle */}
          <div className="flex items-center gap-1 border-b border-border/50 px-3 py-1.5">
            <button
              onClick={() => setViewMode('code')}
              className={'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ' +
                (viewMode === 'code' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Code2 className="h-3 w-3" />
              Code
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ' +
                (viewMode === 'preview' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
            {viewMode === 'preview' && (
              <span className="ml-auto text-[10px] text-muted-foreground/60">loads CDN scripts</span>
            )}
          </div>

          {/* Setup script bar (code mode only) */}
          {viewMode === 'code' && entry.setupScript && (
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
              <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground">
                {entry.setupScript}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(entry.setupScript!).catch(() => {});
                  toast.success('Script copied');
                }}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Code view */}
          {viewMode === 'code' && (
            <pre
              className="overflow-x-auto p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all sm:p-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {entry.code}
            </pre>
          )}

          {/* Preview view */}
          {viewMode === 'preview' && (
            <iframe
              srcDoc={buildPreviewHtml(entry.code)}
              sandbox="allow-scripts"
              title={`Preview: ${entry.name}`}
              className="w-full border-0 bg-[#0f0f12]"
              style={{ height: 280 }}
            />
          )}

          {/* Instructions */}
          {entry.instructions && (
            <div className="border-t border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="h-3 w-3 text-amber-400/70" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Instructions</span>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.instructions}</p>
            </div>
          )}

          {/* Agents */}
          {hasAgents && (
            <div className="border-t border-border/50 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Bot className="h-3 w-3 text-violet-400/70" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Related Agents</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {entry.agents!.map((agent) => (
                  <span key={agent} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-400">
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source URL */}
          {(entry as UserComponentEntry).sourceUrl && (
            <div className="border-t border-border/50 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">Source: </span>
              <a
                href={(entry as UserComponentEntry).sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/70 hover:text-primary underline underline-offset-2 break-all"
              >
                {(entry as UserComponentEntry).sourceUrl}
              </a>
            </div>
          )}

          {/* Mobile actions */}
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

      {/* App: Install Guide */}
      {isApp && showInstall && (
        <div className="border-t border-border bg-muted/10">
          {/* Dependencies */}
          {entry.dependencies.length > 0 && (
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Install:</span>
              <code className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground">
                npm install {entry.dependencies.join(' ')}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('npm install ' + entry.dependencies.join(' ')).catch(() => {});
                  toast.success('Install command copied');
                }}
                className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Setup script */}
          {entry.setupScript && (
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
              <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground">
                {entry.setupScript}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(entry.setupScript!).catch(() => {});
                  toast.success('Script copied');
                }}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Agents */}
          {hasAgents && (
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <Bot className="h-3 w-3 shrink-0 text-violet-400/70" />
              <span className="text-[10px] text-muted-foreground">Related agents:</span>
              <div className="flex flex-wrap gap-1">
                {entry.agents!.map((agent) => (
                  <span key={agent} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-400">
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source URL (app type) */}
          {(entry as UserComponentEntry).sourceUrl && (
            <div className="border-b border-border/50 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">Source: </span>
              <a
                href={(entry as UserComponentEntry).sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/70 hover:text-primary underline underline-offset-2 break-all"
              >
                {(entry as UserComponentEntry).sourceUrl}
              </a>
            </div>
          )}

          {/* Tab bar: Files | Instructions */}
          {(entry.files?.length || entry.instructions) && (
            <div className="flex border-b border-border/50">
              {entry.files && entry.files.length > 0 && (
                <button
                  onClick={() => setInstallTab('files')}
                  className={'px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (installTab === 'files'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground')}
                >
                  Files
                </button>
              )}
              {entry.instructions && (
                <button
                  onClick={() => setInstallTab('instructions')}
                  className={'flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (installTab === 'instructions'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground')}
                >
                  <BookOpen className="h-3 w-3" /> Instructions
                </button>
              )}
              {/* File sub-tabs when on files tab */}
              {installTab === 'files' && entry.files && entry.files.map((file, i) => (
                <button
                  key={file.path}
                  onClick={() => onInstallFileSelect(i)}
                  className={'shrink-0 px-3 py-1.5 text-xs font-mono transition-colors ' +
                    (installFileIndex === i
                      ? 'border-b-2 border-primary text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground')}
                >
                  {file.path}
                </button>
              ))}
            </div>
          )}

          {/* Instructions panel */}
          {installTab === 'instructions' && entry.instructions && (
            <div className="p-3">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.instructions}</p>
            </div>
          )}

          {/* File content panel */}
          {installTab === 'files' && entry.files && entry.files[installFileIndex] && (
            <div className="relative">
              <button
                onClick={() => onInstallFileCopy(entry.files![installFileIndex].content, installFileIndex)}
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {installCopiedFile === installFileIndex
                  ? <><Check className="h-3 w-3 text-green-400" /> Copied</>
                  : <><Copy className="h-3 w-3" /> Copy</>}
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
