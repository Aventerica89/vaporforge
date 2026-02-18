import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Tablet,
  Smartphone,
  Loader2,
} from 'lucide-react';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import { ComponentTree } from './ComponentTree';
import { EditPanel } from './EditPanel';

interface ComponentInfo {
  component: string;
  file: string;
}

type ViewportPreset = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_WIDTHS: Record<ViewportPreset, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

export function AgencyEditor() {
  const { editingSiteId, closeEditor, previewUrl, setPreviewUrl } =
    useAgencyStore();
  const [selectedComponent, setSelectedComponent] =
    useState<ComponentInfo | null>(null);
  const [componentTree, setComponentTree] = useState<ComponentInfo[]>([]);
  const [treeVisible, setTreeVisible] = useState(true);
  const [viewport, setViewport] = useState<ViewportPreset>('desktop');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Start editing session on mount
  useEffect(() => {
    if (!editingSiteId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const startSession = async () => {
      try {
        const token = localStorage.getItem('session_token');
        const res = await fetch(`/api/agency/sites/${editingSiteId}/edit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(
            json?.error ?? `Failed to start session (${res.status})`,
          );
        }

        const json = await res.json();
        setPreviewUrl(json.data.previewUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    startSession();
    return () => {
      cancelled = true;
    };
  }, [editingSiteId, setPreviewUrl]);

  // Listen for postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only process messages from our preview iframe
      if (previewUrl) {
        try {
          const previewOrigin = new URL(previewUrl).origin;
          if (event.origin !== previewOrigin) return;
        } catch {
          return;
        }
      }

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'vf-select') {
        setSelectedComponent({
          component: data.component,
          file: data.file,
        });
      } else if (data.type === 'vf-deselect') {
        setSelectedComponent(null);
      } else if (data.type === 'vf-tree') {
        setComponentTree(data.components ?? []);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewUrl]);

  // Escape key closes editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeEditor]);

  const handleSendEdit = useCallback(
    async (instruction: string, componentFile: string | null) => {
      if (!editingSiteId) return;
      setIsStreaming(true);
      try {
        const token = localStorage.getItem('session_token');
        await fetch(`/api/agency/sites/${editingSiteId}/edit-component`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            componentFile,
            instruction,
            siteWide: !componentFile,
          }),
        });

        // Auto-commit after edit
        await fetch(`/api/agency/sites/${editingSiteId}/commit`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            componentName: componentFile
              ? componentFile.split('/').pop()?.replace('.astro', '')
              : 'theme',
            instruction,
          }),
        });

        // Reload iframe to show changes
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
      } catch {
        // Edit errors shown via streaming response
      } finally {
        setIsStreaming(false);
      }
    },
    [editingSiteId],
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-zinc-950">
      {/* Component Tree (collapsible left sidebar) */}
      {treeVisible && (
        <ComponentTree
          components={componentTree}
          selectedComponent={selectedComponent?.component ?? null}
          onSelect={(comp) => setSelectedComponent(comp)}
        />
      )}

      {/* Center: toolbar + iframe preview */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-10 items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-3">
          {/* Toggle tree */}
          <button
            onClick={() => setTreeVisible(!treeVisible)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title={treeVisible ? 'Hide tree' : 'Show tree'}
          >
            {treeVisible ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>

          {/* Viewport presets */}
          <div className="flex items-center rounded-md border border-zinc-700">
            {(
              [
                { key: 'desktop', icon: Monitor },
                { key: 'tablet', icon: Tablet },
                { key: 'mobile', icon: Smartphone },
              ] as const
            ).map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewport(key)}
                className={`p-1.5 transition-colors ${
                  viewport === key
                    ? 'bg-zinc-700 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={key}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Preview URL */}
          {previewUrl && (
            <span className="ml-2 truncate font-mono text-[10px] text-zinc-500">
              {previewUrl}
            </span>
          )}

          {/* Right side: close */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={closeEditor}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="Close editor (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Iframe area */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 p-2">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Starting preview server...</span>
            </div>
          ) : error ? (
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <span className="text-sm text-red-400">{error}</span>
              <button
                onClick={closeEditor}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                Back to Dashboard
              </button>
            </div>
          ) : previewUrl ? (
            <div
              className="h-full transition-all duration-300"
              style={{
                width: VIEWPORT_WIDTHS[viewport],
                maxWidth: '100%',
              }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="h-full w-full rounded-md border border-zinc-800 bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Edit Panel (right sidebar) */}
      <EditPanel
        selectedComponent={selectedComponent}
        siteId={editingSiteId}
        onSendEdit={handleSendEdit}
        isStreaming={isStreaming}
      />
    </div>
  );
}
