import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Header } from './Header';
import { FileTree } from './FileTree';
import { Editor } from './Editor';
import { ChatPanel } from './ChatPanel';
import { Terminal } from './Terminal';
import { useSandboxStore } from '@/hooks/useSandbox';

export function Layout() {
  const { loadSessions, currentSession } = useSandboxStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      {currentSession ? (
        <PanelGroup direction="horizontal" className="flex-1">
          {/* File Tree */}
          <Panel defaultSize={15} minSize={10} maxSize={30}>
            <FileTree />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Editor + Terminal */}
          <Panel defaultSize={55} minSize={30}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={70} minSize={20}>
                <Editor />
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

              <Panel defaultSize={30} minSize={10}>
                <Terminal />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Chat Panel */}
          <Panel defaultSize={30} minSize={20} maxSize={50}>
            <ChatPanel />
          </Panel>
        </PanelGroup>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}

function WelcomeScreen() {
  const { sessions, createSession, selectSession, isLoadingSessions } =
    useSandboxStore();

  const handleNewSession = async () => {
    await createSession();
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Welcome to VaporForge</h2>
          <p className="mt-2 text-muted-foreground">
            Create a new session or resume an existing one
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={handleNewSession}
            className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">New Session</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a fresh development environment
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              // Clone from Git modal would go here
            }}
            className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">Clone Repository</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start from an existing Git repo
              </p>
            </div>
          </button>
        </div>

        {sessions.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Recent Sessions
            </h3>
            {isLoadingSessions ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.slice(0, 5).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => selectSession(session.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                  >
                    <div className="text-left">
                      <p className="font-medium">
                        {(session.metadata as { name?: string })?.name ||
                          session.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.gitRepo || 'Empty workspace'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          session.status === 'active'
                            ? 'bg-green-500'
                            : session.status === 'sleeping'
                              ? 'bg-yellow-500'
                              : 'bg-gray-500'
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {new Date(session.lastActiveAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
