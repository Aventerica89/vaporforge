import { useState, useCallback } from 'react';
import { Plus, Trash2, Smartphone, Tablet, Monitor, Pencil } from 'lucide-react';
import { usePlayground } from '@/hooks/usePlayground';

const VIEWPORT_SIZES = {
  mobile: { width: 375, label: 'Mobile' },
  tablet: { width: 768, label: 'Tablet' },
  desktop: { width: '100%', label: 'Desktop' },
} as const;

export function CanvasTab() {
  const {
    panels,
    activePanel,
    viewport,
    addPanel,
    removePanel,
    updatePanel,
    setActivePanel,
    setViewport,
  } = usePlayground();

  const [newPanelName, setNewPanelName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  const current = panels.find((p) => p.id === activePanel);

  const handleCreate = useCallback(() => {
    const name = newPanelName.trim() || 'Untitled';
    addPanel(name);
    setNewPanelName('');
    setShowNewForm(false);
  }, [newPanelName, addPanel]);

  return (
    <div className="flex h-full flex-col">
      {/* Panel selector + viewport controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        {/* Panel tabs */}
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-x-auto scrollbar-none">
          {panels.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activePanel === panel.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {panel.name}
            </button>
          ))}

          {showNewForm ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={newPanelName}
                onChange={(e) => setNewPanelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setShowNewForm(false);
                }}
                placeholder="Panel name..."
                className="h-7 w-28 rounded border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none sm:w-36"
              />
              <button
                onClick={handleCreate}
                className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Panel</span>
            </button>
          )}
        </div>

        {/* Viewport toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            onClick={() => setViewport('mobile')}
            className={`rounded p-1.5 transition-colors ${
              viewport === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Mobile (375px)"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`rounded p-1.5 transition-colors ${
              viewport === 'tablet' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Tablet (768px)"
          >
            <Tablet className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewport('desktop')}
            className={`rounded p-1.5 transition-colors ${
              viewport === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Desktop (100%)"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto bg-muted/20 p-3 sm:p-4" style={{ overscrollBehavior: 'contain' }}>
        {!current ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-4">
              <Pencil className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Create a panel to start building components.
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              className="rounded-md bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Create Panel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {current.name}
              </h3>
              <button
                onClick={() => removePanel(current.id)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>

            {/* Code editor area */}
            <div
              className="mx-auto w-full overflow-hidden rounded-lg border border-border bg-card"
              style={{
                maxWidth:
                  viewport === 'desktop'
                    ? '100%'
                    : `${VIEWPORT_SIZES[viewport].width}px`,
              }}
            >
              <div className="border-b border-border bg-muted/50 px-3 py-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {VIEWPORT_SIZES[viewport].label}{' '}
                  {viewport !== 'desktop' && `(${VIEWPORT_SIZES[viewport].width}px)`}
                </span>
              </div>
              <textarea
                value={current.code}
                onChange={(e) => updatePanel(current.id, { code: e.target.value })}
                className="w-full min-h-[200px] resize-y bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none sm:min-h-[300px] md:min-h-[400px]"
                placeholder="// Write your component code here..."
                spellCheck={false}
                style={{ tabSize: 2 }}
              />
            </div>

            {/* Preview placeholder */}
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                Live preview coming soon — for now, paste code into your sandbox to preview.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
