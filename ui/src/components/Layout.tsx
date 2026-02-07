import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useRef } from 'react';
import { Header } from './Header';
import { FileTree } from './FileTree';
import { Editor } from './Editor';
import { ChatPanel } from './ChatPanel';
import { Terminal } from './Terminal';
import { MobileNavigation, type MobileView } from './MobileNavigation';
import { useSandboxStore } from '@/hooks/useSandbox';
import { Changelog } from './Changelog';
import { CloneRepoModal } from './CloneRepoModal';

export function Layout() {
  const { loadSessions, currentSession } = useSandboxStore();
  const [mobileView, setMobileView] = useState<MobileView>('editor');
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

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <Header />

      {currentSession ? (
        <>
          {/* Mobile Layout - Single View */}
          {isMobile ? (
            <div className="flex-1 flex flex-col pb-16 overflow-hidden">
              {/* Files View */}
              <div
                className={`${
                  mobileView === 'files' ? 'flex' : 'hidden'
                } flex-1 flex-col animate-fade-up`}
              >
                <FileTree />
              </div>

              {/* Editor View */}
              <div
                className={`${
                  mobileView === 'editor' ? 'flex' : 'hidden'
                } flex-1 flex-col animate-fade-up`}
              >
                <Editor />
              </div>

              {/* Terminal View */}
              <div
                className={`${
                  mobileView === 'terminal' ? 'flex' : 'hidden'
                } flex-1 flex-col animate-fade-up terminal-effect`}
              >
                <Terminal />
              </div>

              {/* Chat View */}
              <div
                className={`${
                  mobileView === 'chat' ? 'flex' : 'hidden'
                } flex-1 flex-col animate-fade-up`}
              >
                <ChatPanel />
              </div>

              <MobileNavigation
                activeView={mobileView}
                onViewChange={setMobileView}
              />
            </div>
          ) : (
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
                        <Terminal />
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
          )}
        </>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}

function WelcomeScreen() {
  const { sessions, createSession, selectSession, terminateSession, isLoadingSessions } =
    useSandboxStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCloneModal, setShowCloneModal] = useState(false);

  const handleNewSession = async () => {
    await createSession();
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8 safe-bottom">
      <div className="mx-auto w-full max-w-2xl space-y-6 md:space-y-8 py-8 md:py-16 animate-fade-up">
        {/* Hero Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-display font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary animate-fade-down">
            VAPORFORGE
          </h1>
          <p className="text-base md:text-lg text-muted-foreground animate-fade-down stagger-1">
            Web-based Claude Code IDE
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-fade-down stagger-2">
            <div className="status-indicator text-success">
              <span className="font-mono">ONLINE</span>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 animate-fade-up stagger-2">
          <button
            onClick={handleNewSession}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:scale-[1.02] hover:border-primary hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
              <svg
                className="h-6 w-6 md:h-7 md:w-7 text-primary transition-all duration-300 group-hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-base md:text-lg font-bold uppercase tracking-wide">
                New Session
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                Start fresh workspace
              </p>
            </div>
          </button>

          <button
            onClick={() => setShowCloneModal(true)}
            className="glass-card flex flex-col items-center gap-4 p-6 md:p-8 text-center transition-all duration-300 hover:scale-[1.02] hover:border-secondary hover:shadow-[0_0_20px_hsl(var(--secondary)/0.3)] group"
          >
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-lg bg-secondary/10 transition-all duration-300 group-hover:bg-secondary/20 group-hover:scale-110">
              <svg
                className="h-6 w-6 md:h-7 md:w-7 text-secondary transition-all duration-300 group-hover:drop-shadow-[0_0_8px_hsl(var(--secondary)/0.8)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-base md:text-lg font-bold uppercase tracking-wide">
                Clone Repo
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                Import from Git
              </p>
            </div>
          </button>
        </div>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div className="space-y-3 md:space-y-4 animate-fade-up stagger-3">
            <h3 className="text-xs md:text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
              Recent Sessions
            </h3>
            {isLoadingSessions ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.slice(0, 5).map((session, index) => (
                  <div
                    key={session.id}
                    className="glass-card group flex w-full items-center justify-between p-4 md:p-5 transition-all duration-300 hover:scale-[1.01] hover:border-primary hover:shadow-[0_0_15px_hsl(var(--primary)/0.2)] animate-fade-up"
                    style={{ animationDelay: `${(index + 1) * 50}ms` }}
                  >
                    <button
                      onClick={() => selectSession(session.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="font-mono text-sm md:text-base font-semibold truncate">
                        {(session.metadata as { name?: string })?.name ||
                          session.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">
                        {session.gitRepo || 'Empty workspace'}
                      </p>
                    </button>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div
                        className={`status-indicator text-xs ${
                          session.status === 'active'
                            ? 'text-success'
                            : session.status === 'sleeping'
                              ? 'text-warning'
                              : 'text-muted-foreground'
                        }`}
                      >
                        <span className="hidden sm:inline font-mono uppercase">
                          {session.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                        {new Date(session.lastActiveAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setDeletingId(session.id);
                          await terminateSession(session.id);
                          setDeletingId(null);
                        }}
                        disabled={deletingId === session.id}
                        className="rounded p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-opacity"
                        title="Delete session"
                      >
                        {deletingId === session.id ? (
                          <span className="h-4 w-4 block animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                        ) : (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Version + Changelog */}
        <Changelog />

        {/* Footer Info */}
        <div className="text-center text-xs text-muted-foreground font-mono animate-fade-up stagger-4">
          <p>Powered by Cloudflare Sandboxes</p>
        </div>
      </div>

      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
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
