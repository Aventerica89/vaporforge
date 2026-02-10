import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useRef } from 'react';
import { SessionTabBar } from './SessionTabBar';
import { FileTree } from './FileTree';
import { Editor } from './Editor';
import { ChatPanel } from './ChatPanel';
import { XTerminal } from './XTerminal';
import { MobileLayout } from './MobileLayout';
import { WelcomeScreen } from './WelcomeScreen';
import { SettingsPage } from './SettingsPage';
import { DebugPanel } from './DebugPanel';
import { MarketplacePage } from './marketplace';
import { IssueTracker } from './IssueTracker';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { useSettingsStore } from '@/hooks/useSettings';
import { useMarketplace } from '@/hooks/useMarketplace';

export function Layout() {
  const { loadSessions, selectSession, currentSession, openFiles } =
    useSandboxStore();
  useAutoReconnect();
  const { layoutTier } = useDeviceInfo();
  const { isOpen: settingsOpen } = useSettingsStore();
  const { isOpen: marketplaceOpen } = useMarketplace();
  const isMobile = layoutTier === 'phone';
  const isTablet = layoutTier === 'tablet';

  // Panel refs for collapse/expand
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  const toggleFileTree = useCallback(() => {
    const panel = fileTreePanelRef.current;
    if (!panel) return;
    if (fileTreeCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
    setFileTreeCollapsed(!fileTreeCollapsed);
  }, [fileTreeCollapsed]);

  const toggleRightPanel = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightPanelCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
    setRightPanelCollapsed(!rightPanelCollapsed);
  }, [rightPanelCollapsed]);

  // Focus mode: collapse both sidebars for full-screen chat
  const toggleFocusMode = useCallback(() => {
    const filePanel = fileTreePanelRef.current;
    const rightPanel = rightPanelRef.current;
    const bothCollapsed = fileTreeCollapsed && rightPanelCollapsed;

    if (bothCollapsed) {
      // Restore both panels
      filePanel?.expand();
      rightPanel?.expand();
      setFileTreeCollapsed(false);
      setRightPanelCollapsed(false);
    } else {
      // Collapse both panels
      filePanel?.collapse();
      rightPanel?.collapse();
      setFileTreeCollapsed(true);
      setRightPanelCollapsed(true);
    }
  }, [fileTreeCollapsed, rightPanelCollapsed]);

  // Auto-expand right panel when a file is opened
  useEffect(() => {
    if (openFiles.length > 0 && rightPanelCollapsed) {
      rightPanelRef.current?.expand();
      setRightPanelCollapsed(false);
    }
  }, [openFiles.length]);

  // Load sessions, then auto-restore last active session
  useEffect(() => {
    const init = async () => {
      await loadSessions();
      const savedId = localStorage.getItem('vf_active_session');
      if (savedId && !useSandboxStore.getState().currentSession) {
        // Only restore if the session is still alive (not pending-delete or gone)
        const alive = useSandboxStore
          .getState()
          .sessions.find(
            (s) => s.id === savedId && s.status !== 'pending-delete'
          );
        if (alive) {
          selectSession(savedId);
        } else {
          localStorage.removeItem('vf_active_session');
        }
      }
    };
    init();
  }, [loadSessions, selectSession]);

  // Tablet: collapse file tree by default for more screen real estate
  useEffect(() => {
    if (isTablet && fileTreePanelRef.current) {
      fileTreePanelRef.current.collapse();
      setFileTreeCollapsed(true);
    }
  }, [isTablet]);

  // Keyboard shortcuts: Cmd+1 (files), Cmd+2 (editor/terminal), Cmd+3 (focus), Cmd+Shift+P (marketplace)
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd+Shift+P — open marketplace
      if (e.shiftKey && e.key === 'p') {
        e.preventDefault();
        const mp = useMarketplace.getState();
        if (mp.isOpen) {
          mp.closeMarketplace();
        } else {
          mp.openMarketplace();
        }
        return;
      }

      if (!currentSession) return;

      if (e.key === '1') {
        e.preventDefault();
        toggleFileTree();
      } else if (e.key === '2') {
        e.preventDefault();
        toggleRightPanel();
      } else if (e.key === '3') {
        e.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, currentSession, toggleFileTree, toggleRightPanel, toggleFocusMode]);

  // Panel size defaults
  const fileTreeDefaultSize = isTablet ? 0 : 15;
  const chatDefaultSize = isTablet ? 65 : 55;
  const rightDefaultSize = isTablet ? 35 : 30;

  // Full-page marketplace view
  if (marketplaceOpen) {
    return (
      <>
        <MarketplacePage />
        <IssueTracker />
        <DebugPanel />
      </>
    );
  }

  // Full-page settings view (both mobile and desktop)
  if (settingsOpen) {
    return (
      <>
        <SettingsPage />
        <IssueTracker />
        <DebugPanel />
      </>
    );
  }

  // Mobile gets its own layout with drawer navigation
  if (isMobile) {
    return (
      <div className="bg-background overflow-hidden">
        <MobileLayout />
        <IssueTracker />
        <DebugPanel />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <SessionTabBar />

      {currentSession ? (
        /* Desktop/Tablet Layout - Resizable Panels */
        /* Order: Files (15%) | Chat (55%) | Editor+Terminal (30%) */
        <PanelGroup direction="horizontal" className="flex-1">
          {/* File Tree */}
          <Panel
            ref={fileTreePanelRef}
            defaultSize={fileTreeDefaultSize}
            minSize={5}
            maxSize={30}
            collapsible
            collapsedSize={0}
            onCollapse={() => setFileTreeCollapsed(true)}
            onExpand={() => setFileTreeCollapsed(false)}
          >
            <div className="flex h-full flex-col">
              <PanelHeader
                title="Files"
                shortcut="1"
                collapsed={fileTreeCollapsed}
                onToggle={toggleFileTree}
              />
              <div className="flex-1 overflow-hidden">
                <FileTree />
              </div>
            </div>
          </Panel>

          <ResizeHandle direction="vertical" />

          {/* Chat — primary center workspace */}
          <Panel defaultSize={chatDefaultSize} minSize={30}>
            <ChatPanel primary />
          </Panel>

          <ResizeHandle direction="vertical" />

          {/* Right panel: Editor + Terminal (collapsible) */}
          <Panel
            ref={rightPanelRef}
            defaultSize={rightDefaultSize}
            minSize={5}
            maxSize={60}
            collapsible
            collapsedSize={0}
            onCollapse={() => setRightPanelCollapsed(true)}
            onExpand={() => setRightPanelCollapsed(false)}
          >
            <PanelGroup direction="vertical">
              <Panel defaultSize={70} minSize={20}>
                <div className="flex h-full flex-col">
                  <PanelHeader
                    title="Editor"
                    shortcut="2"
                    collapsed={rightPanelCollapsed}
                    onToggle={toggleRightPanel}
                  />
                  <div className="flex-1 overflow-hidden">
                    <Editor />
                  </div>
                </div>
              </Panel>

              <ResizeHandle direction="horizontal" />

              <Panel
                ref={terminalPanelRef}
                defaultSize={30}
                minSize={5}
                collapsible
                collapsedSize={0}
                onCollapse={() => setTerminalCollapsed(true)}
                onExpand={() => setTerminalCollapsed(false)}
              >
                <div className="flex h-full flex-col">
                  <PanelHeader
                    title="Terminal"
                    collapsed={terminalCollapsed}
                    onToggle={() => {
                      const panel = terminalPanelRef.current;
                      if (!panel) return;
                      if (terminalCollapsed) {
                        panel.expand();
                      } else {
                        panel.collapse();
                      }
                      setTerminalCollapsed(!terminalCollapsed);
                    }}
                  />
                  <div className="terminal-effect flex-1 overflow-hidden">
                    <XTerminal />
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      ) : (
        <WelcomeScreen />
      )}

      <IssueTracker />
      <DebugPanel />
    </div>
  );
}

// Collapsible panel header with keyboard shortcut hint
function PanelHeader({
  title,
  shortcut,
  collapsed,
  onToggle,
}: {
  title: string;
  shortcut?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-muted/50 px-3">
      <span className="font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </span>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        title={`Toggle ${title}${shortcut ? ` (Cmd+${shortcut})` : ''}`}
      >
        {shortcut && (
          <span className="text-[9px] font-mono opacity-50">
            {'\u2318'}{shortcut}
          </span>
        )}
        <svg
          className={`h-3 w-3 transition-transform ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  );
}

// Enhanced resize handle with better grab area and visual indicator
function ResizeHandle({ direction }: { direction: 'vertical' | 'horizontal' }) {
  const isVertical = direction === 'vertical';

  return (
    <PanelResizeHandle
      className={`panel-separator group relative ${
        isVertical ? 'w-[6px]' : 'h-[6px]'
      }`}
    >
      {/* Wider invisible hit area */}
      <div
        className={`absolute ${
          isVertical
            ? 'inset-y-0 -left-1 -right-1'
            : 'inset-x-0 -top-1 -bottom-1'
        }`}
      />
      {/* Visible grip dots */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex ${
          isVertical ? 'flex-col' : 'flex-row'
        } gap-[3px] opacity-40 transition-opacity group-hover:opacity-100`}
      >
        <div className="h-1 w-1 rounded-full bg-foreground" />
        <div className="h-1 w-1 rounded-full bg-foreground" />
        <div className="h-1 w-1 rounded-full bg-foreground" />
      </div>
    </PanelResizeHandle>
  );
}
