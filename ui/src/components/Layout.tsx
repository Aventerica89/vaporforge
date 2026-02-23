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
import { TabletLayout } from './TabletLayout';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';
import { DebugPanel } from './DebugPanel';
import { MarketplacePage } from './marketplace';
import { IssueTracker } from './IssueTracker';
import { DevChangelog } from './DevChangelog';
import { DevPlayground } from './DevPlayground';
import { QuickChatPanel } from './QuickChatPanel';
import { CodeTransformPanel } from './CodeTransformPanel';
import { CodeAnalysisPanel } from './CodeAnalysisPanel';
import { CommitMessageCard } from './CommitMessageCard';
import { TestResultsOverlay } from './TestResultsOverlay';
import { StackTraceOverlay } from './StackTraceOverlay';
import { AgencyDashboard } from './agency/AgencyDashboard';
import { AgencyEditor } from './agency/AgencyEditor';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { useSettingsStore } from '@/hooks/useSettings';
import type { SettingsTab } from '@/hooks/useSettings';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useAgencyStore } from '@/hooks/useAgencyStore';
import { parseHash, buildHash } from '@/lib/hash-nav';
import type { HashState } from '@/lib/hash-nav';
import { usePlayground } from '@/hooks/usePlayground';
import { useDevChangelog } from '@/hooks/useDevChangelog';
import { triggerCommitMessage } from '@/hooks/useCommitMessage';
import { useLayoutStore } from '@/hooks/useLayoutStore';

// Apply navigation state from a parsed hash — called on mount and hashchange.
// Uses .getState() to always read the latest store values without React hooks.
function applyHashState(parsed: HashState) {
  const { sessions, selectSession } = useSandboxStore.getState();
  const { openSettings, closeSettings } = useSettingsStore.getState();
  const { openMarketplace, closeMarketplace } = useMarketplace.getState();
  const { openDashboard, closeDashboard, closeEditor } = useAgencyStore.getState();

  switch (parsed.type) {
    case 'session': {
      closeSettings();
      closeMarketplace();
      closeDashboard();
      closeEditor();
      const session = sessions.find((s) => s.id === parsed.id);
      if (session) selectSession(parsed.id);
      break;
    }
    case 'settings':
      closeMarketplace();
      closeDashboard();
      closeEditor();
      openSettings(parsed.tab as SettingsTab | undefined);
      break;
    case 'marketplace':
      closeSettings();
      closeDashboard();
      closeEditor();
      openMarketplace();
      break;
    case 'agency':
      closeSettings();
      closeMarketplace();
      openDashboard();
      break;
    case 'home':
      closeSettings();
      closeMarketplace();
      closeDashboard();
      closeEditor();
      break;
  }
}

export function Layout() {
  const { loadSessions, currentSession, openFiles, isCreatingSession } =
    useSandboxStore();
  useAutoReconnect();
  const { layoutTier } = useDeviceInfo();
  const { isOpen: settingsOpen, activeTab: settingsTab } = useSettingsStore();
  const { isOpen: marketplaceOpen } = useMarketplace();
  const { dashboardOpen: agencyDashboardOpen, editorOpen: agencyEditorOpen } =
    useAgencyStore();

  // Panel refs for collapse/expand
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  // Track live panel sizes for settings display
  const setCurrentSizes = useLayoutStore((s) => s.setCurrentSizes);
  const handleLayout = useCallback(
    (sizes: number[]) => setCurrentSizes(sizes),
    [setCurrentSizes],
  );

  // Subscribe to reset requests from settings
  const resetRequested = useLayoutStore((s) => s.resetRequested);
  const clearResetRequest = useLayoutStore((s) => s.clearResetRequest);
  const getSavedDefault = useLayoutStore((s) => s.getSavedDefault);

  useEffect(() => {
    if (!resetRequested) return;
    const defaults = getSavedDefault();
    fileTreePanelRef.current?.resize(defaults[0]);
    // Chat panel auto-fills remaining space
    rightPanelRef.current?.resize(defaults[2]);
    clearResetRequest();
  }, [resetRequested, clearResetRequest, getSavedDefault]);

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

  // Load sessions on mount, then restore state from URL hash (refresh persistence)
  useEffect(() => {
    loadSessions().then(() => {
      applyHashState(parseHash(window.location.hash));
    });
  }, [loadSessions]);

  // Sync URL hash to current UI state (write direction)
  useEffect(() => {
    let hash: string;
    if (agencyEditorOpen || agencyDashboardOpen) {
      hash = buildHash({ type: 'agency' });
    } else if (marketplaceOpen) {
      hash = buildHash({ type: 'marketplace' });
    } else if (settingsOpen) {
      hash = buildHash({ type: 'settings', tab: settingsTab });
    } else if (currentSession) {
      hash = buildHash({ type: 'session', id: currentSession.id });
    } else {
      hash = buildHash({ type: 'home' });
    }
    // replaceState does not fire hashchange, so this won't trigger the listener below
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash || window.location.pathname);
    }
  }, [currentSession, settingsOpen, settingsTab, marketplaceOpen, agencyDashboardOpen, agencyEditorOpen]);

  // Handle browser back/forward button navigation via hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHash(window.location.hash);
      applyHashState(parsed);
      if (parsed.type === 'home') {
        useSandboxStore.getState().deselectSession();
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Keyboard shortcuts: Cmd+1 (files), Cmd+2 (editor/terminal), Cmd+3 (focus), Cmd+Shift+P (marketplace)
  useEffect(() => {

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

      // Cmd+Shift+D — toggle dev playground
      if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const pg = usePlayground.getState();
        if (pg.isOpen) {
          pg.closePlayground();
        } else {
          pg.openPlayground();
        }
        return;
      }

      // Cmd+Shift+L — toggle dev changelog
      if (e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        const dc = useDevChangelog.getState();
        if (dc.isOpen) {
          dc.closeChangelog();
        } else {
          dc.openChangelog();
        }
        return;
      }

      // Cmd+Shift+G — generate AI commit message
      if (e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        triggerCommitMessage();
        return;
      }

      // Cmd+Shift+0 — reset panel layout to default
      if (e.shiftKey && (e.key === '0' || e.key === ')')) {
        e.preventDefault();
        useLayoutStore.getState().resetToDefault();
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
  }, [currentSession, toggleFileTree, toggleRightPanel, toggleFocusMode]);

  // Panel size defaults (desktop only — tablet/phone handled by their own layouts)
  const fileTreeDefaultSize = 15;
  const chatDefaultSize = 55;
  const rightDefaultSize = 30;

  // iPad gets sidebar layout (Apple HIG)
  if (layoutTier === 'tablet') {
    return (
      <>
        <TabletLayout />
        <QuickChatPanel />
        <CodeTransformPanel />
        <CodeAnalysisPanel />
        <CommitMessageCard />
        <TestResultsOverlay />
        <StackTraceOverlay />
        <IssueTracker />
        <DevChangelog />
        <DevPlayground />
        <DebugPanel />
      </>
    );
  }

  // iPhone gets tab bar layout (Apple HIG)
  if (layoutTier === 'phone') {
    return (
      <>
        <MobileLayout />
        <QuickChatPanel />
        <CodeTransformPanel />
        <CodeAnalysisPanel />
        <CommitMessageCard />
        <TestResultsOverlay />
        <StackTraceOverlay />
        <IssueTracker />
        <DevChangelog />
        <DevPlayground />
        <DebugPanel />
      </>
    );
  }

  // Desktop-only: Full-screen agency visual editor
  if (agencyEditorOpen) {
    return (
      <>
        <AgencyEditor />
        <DebugPanel />
      </>
    );
  }

  // Desktop-only: Full-page agency dashboard
  if (agencyDashboardOpen) {
    return (
      <>
        <AgencyDashboard />
        <QuickChatPanel />
        <IssueTracker />
        <DevChangelog />
        <DevPlayground />
        <DebugPanel />
      </>
    );
  }

  // Desktop-only: Full-page marketplace view
  if (marketplaceOpen) {
    return (
      <>
        <MarketplacePage />
        <QuickChatPanel />
        <IssueTracker />
        <DevChangelog />
        <DevPlayground />
        <DebugPanel />
      </>
    );
  }

  // Desktop-only: Full-page settings view
  if (settingsOpen) {
    return (
      <>
        <SettingsPage />
        <QuickChatPanel />
        <IssueTracker />
        <DevChangelog />
        <DevPlayground />
        <DebugPanel />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <SessionTabBar />

      {isCreatingSession ? (
        <SessionBootScreen />
      ) : currentSession ? (
        /* Desktop/Tablet Layout - Resizable Panels */
        /* Order: Files (15%) | Chat (55%) | Editor+Terminal (30%) */
        <PanelGroup
          direction="horizontal"
          className="flex-1"
          autoSaveId="vf-layout"
          onLayout={handleLayout}
        >
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

      <QuickChatPanel />
      <CodeTransformPanel />
      <CodeAnalysisPanel />
      <CommitMessageCard />
      <TestResultsOverlay />
      <StackTraceOverlay />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
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
