import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useRef } from 'react';
import { Header } from './Header';
import { FileTree } from './FileTree';
import { Editor } from './Editor';
import { ChatPanel } from './ChatPanel';
import { XTerminal } from './XTerminal';
import { MobileLayout } from './MobileLayout';
import { WelcomeScreen } from './WelcomeScreen';
import { useSandboxStore } from '@/hooks/useSandbox';

export function Layout() {
  const { loadSessions, currentSession } = useSandboxStore();
  const [isMobile, setIsMobile] = useState(false);

  // Panel refs for collapse/expand
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
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

  const toggleChat = useCallback(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (chatCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
    setChatCollapsed(!chatCollapsed);
  }, [chatCollapsed]);

  const toggleTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (terminalCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
    setTerminalCollapsed(!terminalCollapsed);
  }, [terminalCollapsed]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Keyboard shortcuts: Cmd+1 (files), Cmd+2 (editor/terminal), Cmd+3 (chat)
  useEffect(() => {
    if (isMobile || !currentSession) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === '1') {
        e.preventDefault();
        toggleFileTree();
      } else if (e.key === '2') {
        e.preventDefault();
        toggleTerminal();
      } else if (e.key === '3') {
        e.preventDefault();
        toggleChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, currentSession, toggleFileTree, toggleTerminal, toggleChat]);

  // Mobile gets its own layout with drawer navigation
  if (isMobile) {
    return (
      <div className="bg-background overflow-hidden">
        <MobileLayout />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <Header />

      {currentSession ? (
        /* Desktop Layout - Resizable Panels */
        <PanelGroup direction="horizontal" className="flex-1">
          {/* File Tree */}
          <Panel
            ref={fileTreePanelRef}
            defaultSize={15}
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

          {/* Editor + Terminal */}
          <Panel defaultSize={55} minSize={30}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={70} minSize={20}>
                <Editor />
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
                    shortcut="2"
                    collapsed={terminalCollapsed}
                    onToggle={toggleTerminal}
                  />
                  <div className="terminal-effect flex-1 overflow-hidden">
                    <XTerminal />
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="vertical" />

          {/* Chat Panel */}
          <Panel
            ref={chatPanelRef}
            defaultSize={30}
            minSize={5}
            maxSize={50}
            collapsible
            collapsedSize={0}
            onCollapse={() => setChatCollapsed(true)}
            onExpand={() => setChatCollapsed(false)}
          >
            <div className="flex h-full flex-col">
              <PanelHeader
                title="Chat"
                shortcut="3"
                collapsed={chatCollapsed}
                onToggle={toggleChat}
              />
              <div className="flex-1 overflow-hidden">
                <ChatPanel />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      ) : (
        <WelcomeScreen />
      )}
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
  shortcut: string;
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
        title={`Toggle ${title} (Cmd+${shortcut})`}
      >
        <span className="text-[9px] font-mono opacity-50">
          {'\u2318'}{shortcut}
        </span>
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
