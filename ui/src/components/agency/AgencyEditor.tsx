import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Tablet,
  Smartphone,
  Loader2,
  GitCompare,
  Rocket,
  Bug,
  Code2,
  RotateCw,
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import { ComponentTree } from './ComponentTree';
import { EditPanel } from './EditPanel';
import { AgencyLoadingScreen } from './AgencyLoadingScreen';
import { AgencyDebugPanel } from './AgencyDebugPanel';
import { AgencyCodePane } from './AgencyCodePane';
import { AgencyInlineAI } from './AgencyInlineAI';

interface ComponentInfo {
  component: string;
  file: string;
  parent?: string;
  elementTag?: string;
  elementHTML?: string;
  elementText?: string;
}

const CSS_PLACEHOLDER =
  '/* No <style> block found — CSS typed here will be scoped to this component */';

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
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState<string>('');
  const [iframeConnected, setIframeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<{
    summary: string;
    diff: string;
  } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [codePaneCollapsed, setCodePaneCollapsed] = useState(false);
  const [activePane, setActivePane] = useState<'astro' | 'css'>('astro');
  const [astroContent, setAstroContent] = useState('');
  const [cssContent, setCssContent] = useState('');
  const [astroFile, setAstroFile] = useState('');
  const [cssFile, setCssFile] = useState('src/styles/global.css');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const astroSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cssSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const astroContentRef = useRef('');
  // Ref so the postMessage handler (registered once) can read latest codeMode value
  const codeModeRef = useRef(codeMode);
  useEffect(() => { codeModeRef.current = codeMode; }, [codeMode]);

  // Start editing session on mount — fire POST then poll for readiness
  useEffect(() => {
    if (!editingSiteId) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    setIsLoading(true);
    setError(null);

    const token = localStorage.getItem('session_token');

    const startSession = async () => {
      try {
        // Fire the start request
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

        // If already ready (port was exposed), use immediately
        if (json.data.status === 'ready' && json.data.previewUrl) {
          setPreviewUrl(json.data.previewUrl);
          setIsLoading(false);
          return;
        }

        // POST succeeded — setup is in progress. Set initial message.
        setLoadingMessage('Cloning repository...');

        // Poll for readiness (timeout after 5 minutes)
        const pollStart = Date.now();
        const POLL_TIMEOUT = 5 * 60 * 1000;

        pollTimer = setInterval(async () => {
          if (cancelled) return;

          if (Date.now() - pollStart > POLL_TIMEOUT) {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            if (!cancelled) {
              setError('Provisioning timed out. The container may still be starting — try again in a moment.');
              setIsLoading(false);
            }
            return;
          }

          try {
            const statusRes = await fetch(
              `/api/agency/sites/${editingSiteId}/edit/status`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!statusRes.ok || cancelled) return;

            const statusJson = await statusRes.json();
            const { status, previewUrl: url, error: errMsg, message } =
              statusJson.data ?? {};

            // Update loading screen with real stage
            if (message && !cancelled) {
              setLoadingMessage(message);
            }

            if (status === 'ready' && url) {
              if (pollTimer) clearInterval(pollTimer);
              pollTimer = null;
              if (!cancelled) {
                setPreviewUrl(url);
                setIsLoading(false);
              }
            } else if (status === 'error') {
              if (pollTimer) clearInterval(pollTimer);
              pollTimer = null;
              if (!cancelled) {
                setError(errMsg ?? 'Provisioning failed');
                setIsLoading(false);
              }
            }
          } catch {
            // Network hiccup — keep polling
          }
        }, 3000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start');
          setIsLoading(false);
        }
      }
    };

    startSession();
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
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

      if (data.type === 'vf-ready') {
        setIframeConnected(true);
      } else if (data.type === 'vf-select') {
        // In Code Mode, ignore selections with no file — editors can't load without a path.
        // This prevents auto-tagged elements (no data-vf-file) from clearing the code pane.
        if (codeModeRef.current && !data.file) return;
        setSelectedComponent({
          component: data.component,
          file: data.file,
          parent: data.parent,
          elementTag: data.elementTag,
          elementHTML: data.elementHTML,
          elementText: data.elementText,
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

  // Keep ref in sync so async handlers can read latest astroContent without stale closure
  // (cannot add astroContent to useCallback deps without causing re-creation loops)
  useEffect(() => { astroContentRef.current = astroContent; }, [astroContent]);

  // Schedule iframe reload after Astro rebuilds — debounced, cancels pending reload
  const scheduleIframeReload = useCallback((delayMs = 2500) => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      setIframeConnected(false);
      if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
    }, delayMs);
  }, []);

  // Patch the <style> block in an Astro file with new CSS content
  const patchStyleBlock = (astroSource: string, newCss: string) =>
    astroSource.includes('<style')
      ? astroSource.replace(/<style[^>]*>[\s\S]*?<\/style>/i, `<style>\n${newCss}\n</style>`)
      : `${astroSource}\n\n<style>\n${newCss}\n</style>`;

  // Load astro file + extract its <style> block into the CSS editor
  const loadFilesForComponent = useCallback(async (file: string) => {
    if (!editingSiteId) return;
    const token = localStorage.getItem('session_token');
    setAstroFile(file);
    let content = '';
    try {
      const res = await fetch(
        `/api/agency/sites/${editingSiteId}/file?path=${encodeURIComponent(file)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        content = (await res.json()).data?.content ?? '';
        setAstroContent(content);
      }
    } catch {
      setAstroContent('');
    }
    // CSS pane shows the <style> block from this .astro file.
    // cssFile uses a "#style" suffix to signal it's an embedded block (not a standalone file).
    // For Tailwind-only files with no <style> block, show a placeholder comment.
    setCssFile(`${file}#style`);
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const extractedCss = styleMatch?.[1]?.trim() ?? '';
    setCssContent(extractedCss || CSS_PLACEHOLDER);
  }, [editingSiteId]);

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!editingSiteId) return;
    const token = localStorage.getItem('session_token');
    try {
      await fetch(`/api/agency/sites/${editingSiteId}/file`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path, content }),
      });
    } catch {}
  }, [editingSiteId]);

  const handleAstroChange = useCallback((value: string) => {
    setAstroContent(value);
    if (astroSaveTimer.current) clearTimeout(astroSaveTimer.current);
    astroSaveTimer.current = setTimeout(async () => {
      await saveFile(astroFile, value);
      scheduleIframeReload();
    }, 1000);
  }, [saveFile, astroFile, scheduleIframeReload]);

  const handleCssChange = useCallback((value: string) => {
    setCssContent(value);
    if (cssSaveTimer.current) clearTimeout(cssSaveTimer.current);
    cssSaveTimer.current = setTimeout(async () => {
      // Don't save the placeholder comment — only save real CSS
      if (value.trim() === CSS_PLACEHOLDER.trim()) return;
      if (cssFile.endsWith('#style')) {
        // CSS pane edits the <style> block — patch it back into the .astro file
        const astroPath = cssFile.replace('#style', '');
        const updated = patchStyleBlock(astroContentRef.current, value);
        setAstroContent(updated);
        await saveFile(astroPath, updated);
      } else {
        await saveFile(cssFile, value);
      }
      scheduleIframeReload();
    }, 1000);
  }, [saveFile, cssFile, scheduleIframeReload]);

  const handleInlineAIInsert = useCallback((pane: 'astro' | 'css', text: string) => {
    if (pane === 'astro') {
      const next = astroContentRef.current + '\n' + text;
      setAstroContent(next);
      void saveFile(astroFile, next).then(() => scheduleIframeReload(3000));
    } else {
      // Clear placeholder before appending AI-generated CSS
      const baseCss = cssContent.trim() === CSS_PLACEHOLDER.trim() ? '' : cssContent;
      const newCss = baseCss + '\n' + text;
      setCssContent(newCss);
      if (cssFile.endsWith('#style')) {
        const astroPath = cssFile.replace('#style', '');
        const updated = patchStyleBlock(astroContentRef.current, newCss);
        setAstroContent(updated);
        void saveFile(astroPath, updated).then(() => scheduleIframeReload(3000));
      } else {
        void saveFile(cssFile, newCss).then(() => scheduleIframeReload(3000));
      }
    }
  }, [cssContent, astroFile, cssFile, saveFile, scheduleIframeReload]);

  // Load files when code mode activates and a component is selected
  useEffect(() => {
    if (codeMode && selectedComponent?.file) {
      loadFilesForComponent(selectedComponent.file);
    }
  }, [codeMode, selectedComponent?.file, loadFilesForComponent]);

  // Keyboard shortcuts: Escape closes editor, Cmd+Shift+E toggles Code Mode,
  // Cmd+Shift+\ toggles code editors, Cmd+\ toggles tree
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeEditor(); return; }
      if (e.metaKey || e.ctrlKey) {
        if (e.shiftKey && e.key === 'E') { e.preventDefault(); setCodeMode((v) => !v); return; }
        if (e.shiftKey && e.key === '\\') { e.preventDefault(); setCodePaneCollapsed((v) => !v); return; }
        if (e.key === '\\') { e.preventDefault(); setTreeVisible((v) => !v); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeEditor]);

  const handleViewDiff = useCallback(async () => {
    if (!editingSiteId) return;
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(
        `/api/agency/sites/${editingSiteId}/diff`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const json = await res.json();
      setDiffData(json.data);
      setShowDiff(true);
    } catch {
      // silently fail
    }
  }, [editingSiteId]);

  const handlePushLive = useCallback(async () => {
    if (!editingSiteId || isPushing) return;
    setIsPushing(true);
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(
        `/api/agency/sites/${editingSiteId}/push`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'Push failed');
      }
    } catch {
      // error handling TBD
    } finally {
      setIsPushing(false);
    }
  }, [editingSiteId, isPushing]);

  const handleSendEdit = useCallback(
    async (instruction: string, componentFile: string | null, elementHTML: string | null) => {
      if (!editingSiteId) return;
      setIsStreaming(true);
      setStreamingOutput('');
      try {
        const token = localStorage.getItem('session_token');
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

        // Pre-flight: validate token, warm WS server, build prompt, write context file.
        // All operations that can fail with a readable error happen here — the WS
        // upgrade handler is a trivial proxy and ws.onerror gives no body information.
        const preflightParams = new URLSearchParams({
          token: token || '',
          siteId: editingSiteId,
          instruction,
          siteWide: componentFile ? 'false' : 'true',
        });
        if (componentFile) preflightParams.set('componentFile', componentFile);
        if (elementHTML) preflightParams.set('elementHTML', elementHTML);

        const preflightRes = await fetch(`/api/agency/edit-preflight?${preflightParams}`);
        if (!preflightRes.ok) {
          const body = await preflightRes.json().catch(() => null);
          const msg = body?.error ?? `Pre-flight failed (${preflightRes.status})`;
          setStreamingOutput(`[ERROR] ${msg}`);
          return;
        }

        // WS upgrade — context already prepared by pre-flight, only needs siteId
        const wsParams = new URLSearchParams({ token: token || '', siteId: editingSiteId });

        // Connect WS — agent streams progress, closes when done
        await new Promise<void>((resolve) => {
          const ws = new WebSocket(
            `${wsProtocol}//${location.host}/api/agency/edit-ws?${wsParams}`,
          );
          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data as string);
              if (msg.type === 'text-delta' && msg.text) {
                setStreamingOutput((prev) => {
                  const updated = prev + msg.text;
                  // Keep last 800 chars to avoid unbounded growth
                  return updated.length > 800
                    ? updated.slice(updated.length - 800)
                    : updated;
                });
              } else if (msg.type === 'error' && msg.error) {
                // Surface agent errors — previously these were silently dropped
                setStreamingOutput((prev) => prev + `\n[ERROR] ${msg.error}`);
              } else if (msg.type === 'stderr' && msg.text) {
                // Debug stderr lines forwarded from the container
                setStreamingOutput((prev) => {
                  const updated = prev + `\n[DBG] ${msg.text}`;
                  return updated.length > 1200 ? updated.slice(updated.length - 1200) : updated;
                });
              } else if (msg.type === 'process-exit') {
                ws.close();
              }
            } catch {}
          };
          ws.onclose = () => resolve();
          ws.onerror = () => {
            setStreamingOutput((prev) => prev + '\n[ERROR] WebSocket connection failed');
            resolve();
          };
        });

        // Auto-commit now that agent has finished
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

        // Tell iframe to reload after Astro dev server has had time to rebuild (~5s)
        // Use direct src reset (always works) rather than postMessage (silently dropped
        // if inspector isn't listening at the exact moment the message arrives)
        await new Promise((r) => setTimeout(r, 5000));
        setIframeConnected(false);
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
      } catch {
        // Errors surface via WS frames
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

          {/* Preview URL + connection status */}
          {previewUrl && (
            <span className="ml-2 truncate font-mono text-[10px] text-zinc-500">
              {previewUrl}
            </span>
          )}
          {previewUrl && (
            <span
              className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                iframeConnected ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
              title={iframeConnected ? 'Inspector connected' : 'Connecting...'}
            />
          )}
          {previewUrl && (
            <button
              onClick={() => {
                if (iframeRef.current) {
                  setIframeConnected(false);
                  iframeRef.current.src = iframeRef.current.src;
                }
              }}
              className="ml-1 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Refresh preview"
            >
              <RotateCw className="h-3 w-3" />
            </button>
          )}

          {/* Right side: code mode, debug, diff, push, close */}
          <div className="ml-auto flex items-center gap-1">
            {previewUrl && (
              <>
                <button
                  onClick={() => setCodeMode((v) => !v)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-zinc-800 ${
                    codeMode ? 'bg-zinc-700 text-violet-400' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Toggle Code Mode (Cmd+Shift+E)"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>Code</span>
                </button>
                <button
                  onClick={() => setShowDebug(true)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-zinc-800 ${
                    showDebug ? 'bg-zinc-700 text-violet-400' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Debug styling issues"
                >
                  <Bug className="h-3.5 w-3.5" />
                  <span>Debug</span>
                </button>
                <button
                  onClick={handleViewDiff}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  title="View changes"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span>Changes</span>
                </button>
                <button
                  onClick={handlePushLive}
                  disabled={isPushing}
                  className="flex items-center gap-1 rounded bg-emerald-600/80 px-2 py-1 text-[11px] text-white hover:bg-emerald-500 disabled:opacity-50"
                  title="Push changes live"
                >
                  {isPushing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Rocket className="h-3.5 w-3.5" />
                  )}
                  <span>Push Live</span>
                </button>
              </>
            )}
            <button
              onClick={closeEditor}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="Close editor (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Center: preview + optional code editors */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <AgencyLoadingScreen statusMessage={loadingMessage} />
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <span className="text-sm text-red-400">{error}</span>
                <button
                  onClick={closeEditor}
                  className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          ) : previewUrl ? (
            codeMode ? (
              <PanelGroup direction="vertical">
                <Panel defaultSize={55} minSize={20}>
                  <div className="flex h-full items-center justify-center overflow-hidden bg-zinc-950 p-2">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
                    >
                      <iframe
                        ref={iframeRef}
                        src={previewUrl}
                        className="h-full w-full rounded-md border border-zinc-800 bg-white"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                  </div>
                </Panel>
                {!codePaneCollapsed && (
                  <>
                    <PanelResizeHandle className="h-1.5 bg-zinc-700 hover:bg-violet-500 cursor-row-resize transition-colors" />
                    <Panel defaultSize={45} minSize={15}>
                      <AgencyCodePane
                        astroFile={astroFile}
                        cssFile={cssFile}
                        astroContent={astroContent}
                        cssContent={cssContent}
                        onAstroChange={handleAstroChange}
                        onCssChange={handleCssChange}
                        activePane={activePane}
                        onActivePaneChange={setActivePane}
                        onCollapse={() => setCodePaneCollapsed(true)}
                      />
                    </Panel>
                  </>
                )}
                {codePaneCollapsed && (
                  <button
                    onClick={() => setCodePaneCollapsed(false)}
                    className="flex h-6 w-full items-center justify-center border-t border-zinc-700 bg-zinc-900 text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Show editors
                  </button>
                )}
              </PanelGroup>
            ) : (
              <div className="flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 p-2">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
                >
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    className="h-full w-full rounded-md border border-zinc-800 bg-white"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Right panel: Edit (Chat Mode) or Inline AI (Code Mode) */}
      {codeMode ? (
        <div className="w-72 shrink-0">
          <AgencyInlineAI
            siteId={editingSiteId}
            activePane={activePane}
            cssContext={cssContent}
            astroContext={astroContent}
            elementContext={selectedComponent?.elementHTML ?? ''}
            onInsert={handleInlineAIInsert}
          />
        </div>
      ) : (
        <EditPanel
          selectedComponent={selectedComponent}
          siteId={editingSiteId}
          onSendEdit={handleSendEdit}
          isStreaming={isStreaming}
          streamingOutput={streamingOutput}
        />
      )}

      {/* Debug panel */}
      {showDebug && (
        <AgencyDebugPanel
          siteId={editingSiteId}
          selectedComponent={selectedComponent}
          onClose={() => setShowDebug(false)}
        />
      )}

      {/* Diff modal */}
      {showDiff && diffData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-700 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
              <span className="text-sm font-medium text-zinc-200">
                Changes
              </span>
              <button
                onClick={() => setShowDiff(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {diffData.summary && (
              <div className="border-b border-zinc-800 px-4 py-2">
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
                  {diffData.summary}
                </pre>
              </div>
            )}
            <div className="flex-1 overflow-auto px-4 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300">
                {diffData.diff || 'No changes'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
