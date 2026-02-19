import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MonacoEditor from '@monaco-editor/react';
import { ChevronDown } from 'lucide-react';

interface AgencyCodePaneProps {
  astroFile: string;
  cssFile: string;
  astroContent: string;
  cssContent: string;
  onAstroChange: (value: string) => void;
  onCssChange: (value: string) => void;
  activePane: 'astro' | 'css';
  onActivePaneChange: (pane: 'astro' | 'css') => void;
  onCollapse: () => void;
}

export function AgencyCodePane({
  astroFile,
  cssFile,
  astroContent,
  cssContent,
  onAstroChange,
  onCssChange,
  activePane,
  onActivePaneChange,
  onCollapse,
}: AgencyCodePaneProps) {
  const astroFileName = astroFile.split('/').pop() ?? 'component.astro';
  const cssFileName = cssFile.split('/').pop() ?? 'styles.css';

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-center border-b border-zinc-700 bg-zinc-900">
        <button
          className={`flex items-center gap-1.5 border-r border-zinc-700 px-3 py-1 text-[11px] transition-colors ${
            activePane === 'astro'
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => onActivePaneChange('astro')}
        >
          <span className="font-mono">{astroFileName}</span>
        </button>
        <button
          className={`flex items-center gap-1.5 border-r border-zinc-700 px-3 py-1 text-[11px] transition-colors ${
            activePane === 'css'
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => onActivePaneChange('css')}
        >
          <span className="font-mono">{cssFileName}</span>
        </button>
        <div className="ml-auto">
          <button
            onClick={onCollapse}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            title="Collapse editors (Cmd+Shift+\)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Editors */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={50} minSize={20}>
            <MonacoEditor
              height="100%"
              language="html"
              value={astroContent}
              onChange={(val) => onAstroChange(val ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              onMount={() => onActivePaneChange('astro')}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-violet-500 cursor-col-resize transition-colors" />
          <Panel defaultSize={50} minSize={20}>
            <MonacoEditor
              height="100%"
              language="css"
              value={cssContent}
              onChange={(val) => onCssChange(val ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              onMount={() => onActivePaneChange('css')}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
