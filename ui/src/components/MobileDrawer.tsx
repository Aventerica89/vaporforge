import { useRef, useCallback } from 'react';
import {
  X,
  Plus,
  GitBranch,
  FolderTree,
  Terminal,
  LogOut,
  Settings,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { haptics } from '@/lib/haptics';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFiles: () => void;
  onOpenTerminal: () => void;
  onOpenCloneModal: () => void;
  onOpenSettings: () => void;
}

export function MobileDrawer({
  isOpen,
  onClose,
  onOpenFiles,
  onOpenTerminal,
  onOpenCloneModal,
  onOpenSettings,
}: MobileDrawerProps) {
  const {
    sessions,
    currentSession,
    selectSession,
    createSession,
  } = useSandboxStore();
  const { logout } = useAuthStore();
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const currentTranslateX = useRef(0);

  // Body is permanently position:fixed via CSS — no per-component manipulation needed

  // Swipe-left to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
    currentTranslateX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartX.current === null) return;
    const deltaX = e.touches[0].clientX - dragStartX.current;
    // Only allow swiping left (negative)
    if (deltaX > 0) return;
    currentTranslateX.current = deltaX;
    if (drawerRef.current) {
      drawerRef.current.style.transform = `translateX(${deltaX}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartX.current === null) return;
    dragStartX.current = null;

    // If swiped more than 80px left, close
    if (currentTranslateX.current < -80) {
      haptics.medium();
      onClose();
    }

    // Reset position
    if (drawerRef.current) {
      drawerRef.current.style.transform = '';
    }
    currentTranslateX.current = 0;
  }, [onClose]);

  const handleNewSession = async () => {
    await createSession();
    onClose();
  };

  const handleSelectSession = (sessionId: string) => {
    selectSession(sessionId);
    onClose();
  };

  const handleCloneRepo = () => {
    onOpenCloneModal();
    onClose();
  };

  const handleOpenFiles = () => {
    onOpenFiles();
    onClose();
  };

  const handleOpenTerminal = () => {
    onOpenTerminal();
    onClose();
  };

  const handleOpenSettings = () => {
    onOpenSettings();
    onClose();
  };

  const handleSignOut = () => {
    logout();
    onClose();
  };

  return (
    <>
      {/* Backdrop — touch-action: none in CSS, onTouchMove prevents scroll bleed */}
      <div
        className={`mobile-backdrop fixed inset-0 z-[70] bg-black/60 ${
          isOpen ? 'open' : ''
        }`}
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`mobile-drawer fixed inset-y-0 left-0 z-[71] flex w-[85vw] max-w-xs flex-col ${
          isOpen ? 'open' : ''
        }`}
        style={{
          background: 'hsl(var(--card) / 0.98)',
          backdropFilter: 'blur(20px) saturate(150%)',
          borderRight: '1px solid hsl(var(--border))',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header — safe-top wrapper keeps content below Dynamic Island */}
        <div className="safe-top">
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-border"
            style={{ minHeight: '48px' }}
          >
            <span className="font-display text-sm font-bold tracking-wider text-primary">
              VAPORFORGE
            </span>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Actions */}
          <div className="p-3 space-y-1">
            <button
              onClick={handleNewSession}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4 text-primary" />
              New Session
            </button>
            <button
              onClick={handleCloneRepo}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <GitBranch className="h-4 w-4 text-secondary" />
              Clone Repo
            </button>
          </div>

          <div className="mx-3 border-t border-border" />

          {/* Sessions */}
          <div className="p-3">
            <h4 className="mb-2 px-3 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Sessions
            </h4>
            <div className="space-y-0.5">
              {sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No sessions yet
                </p>
              ) : (
                sessions.slice(0, 10).map((session) => {
                  const isActive = currentSession?.id === session.id;
                  const name =
                    (session.metadata as { name?: string })?.name ||
                    session.id.slice(0, 8);
                  return (
                    <button
                      key={session.id}
                      onClick={() => handleSelectSession(session.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${
                          session.status === 'active'
                            ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
                            : session.status === 'sleeping'
                              ? 'bg-yellow-500'
                              : 'bg-gray-500'
                        }`}
                      />
                      <span className="truncate">{name}</span>
                      {isActive && (
                        <span className="ml-auto text-[10px] font-display uppercase tracking-wider text-primary/60">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Files & Terminal (only when session active) */}
          {currentSession && (
            <>
              <div className="mx-3 border-t border-border" />

              <div className="p-3 space-y-0.5">
                <button
                  onClick={handleOpenFiles}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <FolderTree className="h-4 w-4 text-yellow-500" />
                  Files
                </button>
                <button
                  onClick={handleOpenTerminal}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <Terminal className="h-4 w-4 text-primary" />
                  Terminal
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 safe-bottom space-y-0.5">
          <button
            onClick={handleOpenSettings}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings & Help
          </button>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
