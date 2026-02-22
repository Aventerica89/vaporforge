import { useState, useRef, useEffect } from 'react';
import { Shield, Gauge, Zap, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AutonomyMode = 'conservative' | 'standard' | 'autonomous';

export type AutonomySelectorPopupProps = {
  selected: AutonomyMode;
  onSelect: (m: AutonomyMode) => void;
};

const MODES = [
  {
    key: 'conservative' as const,
    icon: Shield,
    label: 'Conservative',
    short: 'Cautious',
    desc: 'Claude asks before making any changes',
    iconColor: 'text-blue-400',
  },
  {
    key: 'standard' as const,
    icon: Gauge,
    label: 'Standard',
    short: 'Standard',
    desc: 'Auto-accepts edits, asks on risky operations',
    iconColor: 'text-primary',
  },
  {
    key: 'autonomous' as const,
    icon: Zap,
    label: 'Autonomous',
    short: 'Auto',
    desc: 'Full bypass — no confirmation prompts',
    iconColor: 'text-amber-400',
  },
] as const;

export function AutonomySelectorPopup({ selected, onSelect }: AutonomySelectorPopupProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const selectedMode = MODES.find((m) => m.key === selected) ?? MODES[1];
  const SelectedIcon = selectedMode.icon;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
          open
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
        )}
      >
        <SelectedIcon className="size-3 shrink-0" />
        <span>{selectedMode.short}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-white/10 bg-[#1a1a1e] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Permission Mode
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>

          <div className="flex flex-col gap-0.5">
            {MODES.map(({ key, icon: Icon, label, desc, iconColor }) => {
              const isActive = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { onSelect(key); setOpen(false); }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                    isActive ? 'bg-card ring-1 ring-white/10' : 'hover:bg-white/5',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', iconColor)} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-xs font-medium', isActive ? 'text-foreground' : 'text-foreground/80')}>
                        {label}
                      </span>
                      {isActive && (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
