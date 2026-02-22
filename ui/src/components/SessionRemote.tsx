import { useState, useRef, useEffect, useCallback } from 'react';
import { Bookmark, X } from 'lucide-react';
import { checkpointsApi } from '@/lib/api';
import { toast } from '@/hooks/useToast';
import type { Checkpoint } from '@/lib/types';

interface SessionRemoteProps {
  sessionId: string | undefined;
  onSetPrompt: (text: string) => void;
  /** Icon-only trigger — used in the mobile action bar */
  iconOnly?: boolean;
}

type View = 'menu' | 'checkpoint' | 'restore';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SessionRemote({ sessionId, onSetPrompt, iconOnly = false }: SessionRemoteProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [checkpointName, setCheckpointName] = useState('');
  const [summary, setSummary] = useState('');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView('menu');
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const openMenu = useCallback(() => {
    setView('menu');
    setCheckpointName('');
    setSummary('');
    setOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setView('menu');
  }, []);

  const loadCheckpoints = useCallback(async () => {
    const result = await checkpointsApi.list();
    if (result.success && result.data) {
      setCheckpoints(result.data);
    }
  }, []);

  const handleRestore = useCallback(() => {
    setView('restore');
    loadCheckpoints();
  }, [loadCheckpoints]);

  const handleSaveCheckpoint = useCallback(async () => {
    if (!sessionId || !checkpointName.trim()) return;
    setSaving(true);
    try {
      const result = await checkpointsApi.create({
        name: checkpointName.trim(),
        sessionId,
        summary: summary.trim(),
      });
      if (result.success) {
        toast('Checkpoint saved', 'success');
        close();
      } else {
        toast('Failed to save checkpoint', 'error');
      }
    } catch {
      toast('Failed to save checkpoint', 'error');
    } finally {
      setSaving(false);
    }
  }, [sessionId, checkpointName, summary, close]);

  const handleWrapUp = useCallback(async () => {
    if (!sessionId) return;
    const name = `Wrap up · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    try {
      await checkpointsApi.create({ name, sessionId, summary: '' });
      toast('Session wrapped up and saved', 'success');
    } catch {
      toast('Wrap up failed', 'error');
    }
    close();
  }, [sessionId, close]);

  const handlePickCheckpoint = useCallback(
    (cp: Checkpoint) => {
      const date = new Date(cp.timestamp).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const lines = [
        `[Restoring checkpoint: "${cp.name}" — ${date}]`,
        `Session: ${cp.sessionId}`,
        '',
        cp.summary,
      ];
      onSetPrompt(lines.join('\n').trimEnd());
      close();
    },
    [onSetPrompt, close],
  );

  const handleNew = useCallback(() => {
    onSetPrompt('');
    close();
  }, [onSetPrompt, close]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={openMenu}
        title="Session remote"
        className={
          iconOnly
            ? [
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors active:scale-95',
                open
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground',
              ].join(' ')
            : [
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
                open
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
              ].join(' ')
        }
      >
        <Bookmark className={iconOnly ? 'size-5' : 'h-3 w-3'} />
        {!iconOnly && <span>Session</span>}
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 rounded-xl border border-white/10 bg-[#1a1a1e] p-3 shadow-xl">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {view === 'menu' ? 'Session' : view === 'checkpoint' ? 'Save Checkpoint' : 'Restore'}
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Menu view */}
          {view === 'menu' && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-base leading-none">▶</span>
                <div>
                  <div className="text-xs font-medium">New</div>
                  <div className="text-[10px] text-muted-foreground">Start fresh goal</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setView('checkpoint')}
                disabled={!sessionId}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 transition-colors text-left disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="text-base leading-none">⏸</span>
                <div>
                  <div className="text-xs font-medium">Checkpoint</div>
                  <div className="text-[10px] text-muted-foreground">Save session state</div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleRestore}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-base leading-none">⏭</span>
                <div>
                  <div className="text-xs font-medium">Restore</div>
                  <div className="text-[10px] text-muted-foreground">Resume from checkpoint</div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleWrapUp}
                disabled={!sessionId}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 transition-colors text-left disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="text-base leading-none">✓</span>
                <div>
                  <div className="text-xs font-medium">Wrap Up</div>
                  <div className="text-[10px] text-muted-foreground">Auto-save and close</div>
                </div>
              </button>
            </div>
          )}

          {/* Checkpoint sub-view */}
          {view === 'checkpoint' && (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                placeholder="What are you working on?"
                maxLength={80}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-500/50"
              />
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-500/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView('menu')}
                  className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveCheckpoint}
                  disabled={saving || !checkpointName.trim()}
                  className="flex-1 rounded-lg bg-purple-500/20 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Restore sub-view */}
          {view === 'restore' && (
            <div className="flex flex-col gap-1">
              {checkpoints.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No checkpoints yet</p>
              ) : (
                checkpoints.map((cp) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => handlePickCheckpoint(cp)}
                    className="flex flex-col rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="truncate text-xs font-medium text-foreground">{cp.name}</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelative(cp.timestamp)}</span>
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setView('menu')}
                className="mt-1 rounded-lg border border-white/10 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
