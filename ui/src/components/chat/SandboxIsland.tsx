import { Activity, HelpCircle, Pause, Play, Square, Zap } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { TextShimmer } from '@/components/prompt-kit/text-shimmer';
import { PulseLoader } from '@/components/prompt-kit/loader';
import { cn } from '@/lib/cn';

export type SessionStatus = 'idle' | 'streaming' | 'paused';

interface SandboxIslandProps {
  status: SessionStatus;
  controlsOpen?: boolean;
  onNew: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  sentinelActive: boolean;
  sentinelDataReady?: boolean;
  onToggleSentinel: () => void;
}

// ---------------------------------------------------------------------------
// Island content per state
// ---------------------------------------------------------------------------

function IdleContent() {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <div className="h-1.5 w-1.5 rounded-full bg-purple-500/40" />
      <span className="whitespace-nowrap text-xs text-white/40">Ready to start</span>
    </div>
  );
}

function StreamingContent() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <PulseLoader
        size="sm"
        className="[&>div]:border-purple-500"
      />
      <TextShimmer
        className="text-xs"
        style={{
          backgroundImage:
            'linear-gradient(to right, #7c3aed 0%, #d946ef 50%, #7c3aed 100%)',
        }}
      >
        Claude is working...
      </TextShimmer>
    </div>
  );
}

function PausedContent() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <Pause className="h-3 w-3 text-amber-400/80" />
      <span className="whitespace-nowrap text-xs text-white/50">Session paused</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip button
// ---------------------------------------------------------------------------

interface TooltipButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: 'purple' | 'red' | 'amber';
}

function TooltipButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  variant = 'purple',
}: TooltipButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {hovered && (
          <motion.span
            key="tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-300"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'flex size-8 items-center justify-center rounded-full border transition-[border-color,background-color,color,box-shadow] duration-200',
          active
            ? variant === 'red'
              ? 'border-red-500/50 bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
              : variant === 'amber'
                ? 'border-amber-400/60 bg-amber-400/10 text-amber-400 ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                : 'border-purple-500/50 bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'
            : disabled
              ? 'cursor-not-allowed border-zinc-800/50 bg-zinc-900/30 text-zinc-700'
              : variant === 'red'
                ? 'border-zinc-800 bg-zinc-900/60 text-zinc-600 hover:border-red-500/30 hover:text-red-400'
                : variant === 'amber'
                  ? 'border-zinc-800 bg-zinc-900/60 text-zinc-600 hover:border-amber-400/30 hover:text-amber-400'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-purple-500/30 hover:text-zinc-300',
        )}
      >
        {icon}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help button + popover
// ---------------------------------------------------------------------------

interface HelpItem {
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: 'purple' | 'red';
}

const HELP_ITEMS: HelpItem[] = [
  {
    icon: <Zap className="size-3 shrink-0 text-purple-400" />,
    label: 'New session',
    desc: "Spin up a fresh container. Wipes Claude's context, filesystem, and running processes.",
    color: 'purple',
  },
  {
    icon: <Pause className="size-3 shrink-0 text-purple-400" />,
    label: 'Pause',
    desc: 'Freeze the agent mid-run. The container stays alive — nothing is lost.',
    color: 'purple',
  },
  {
    icon: <Play className="size-3 shrink-0 text-purple-400" />,
    label: 'Resume',
    desc: 'Wake the frozen agent. Continues from the exact point it was paused.',
    color: 'purple',
  },
  {
    icon: <Square className="size-3 shrink-0 text-purple-400" />,
    label: 'Stop',
    desc: 'Halt the current run. Your sandbox files stay intact for the next task.',
    color: 'purple',
  },
  {
    icon: <Activity className="size-3 shrink-0 text-red-400" />,
    label: 'Sentinel',
    desc: 'Scans git diffs, TODOs, and recent commits every 5 min. When a briefing is ready, the button glows amber — click it to send the briefing to Claude. Requires GROQ_API_KEY or DEEPSEEK_API_KEY in your secrets.',
    color: 'red',
  },
];

function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            key="help"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.25 }}
            className="absolute bottom-10 right-0 z-20 w-72 overflow-hidden rounded-2xl border border-purple-500/40 bg-background p-3 backdrop-blur-sm before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] before:bg-[size:24px_24px] before:[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)] [&>*]:relative [&>*]:z-10"
          >
            <div className="mb-3 border-b border-purple-500/20 pb-2.5">
              <p className="text-[11px] font-semibold text-zinc-300">Agent session controls</p>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                Claude runs in a real Linux container — not just a chat thread. It has a filesystem,
                processes, and persistent state between messages.
              </p>
            </div>
            <div className="space-y-2">
              {HELP_ITEMS.map(({ icon, label, desc, color }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                      color === 'red'
                        ? 'border-red-500/30 bg-red-500/10'
                        : 'border-purple-500/30 bg-purple-500/10',
                    )}
                  >
                    {icon}
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-zinc-300">{label}</span>
                    <p className="text-[10px] leading-snug text-zinc-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex size-6 items-center justify-center rounded-full transition-colors',
          open ? 'text-purple-400' : 'text-zinc-600 hover:text-zinc-400',
        )}
      >
        <HelpCircle className="size-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SandboxIsland
// ---------------------------------------------------------------------------

const ISLAND_CONTENT = {
  idle: <IdleContent />,
  streaming: <StreamingContent />,
  paused: <PausedContent />,
};

export function SandboxIsland({
  status,
  controlsOpen = false,
  onNew,
  onPause,
  onResume,
  onStop,
  sentinelActive,
  sentinelDataReady = false,
  onToggleSentinel,
}: SandboxIslandProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex min-w-[200px] flex-col items-center gap-3">
      {/* Status pill */}
      <motion.div
        layout
        style={{ borderRadius: 32 }}
        className="overflow-hidden border border-purple-500/20 bg-zinc-950/90 backdrop-blur-sm"
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', bounce: 0.35, duration: 0.3 }
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.04 } }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 480, damping: 38 }}
          >
            {ISLAND_CONTENT[status]}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Controls row — 5 buttons centered, ? floating to the right */}
      <AnimatePresence mode="popLayout">
        {controlsOpen && (
          <motion.div
            key="controls"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 42, mass: 0.5 }}
          >
            <div className="relative flex items-center">
              <div className="flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-zinc-950/60 p-1.5 backdrop-blur-sm">
                <TooltipButton
                  icon={<Zap className="size-3" />}
                  label="New session"
                  onClick={onNew}
                  active={status === 'idle'}
                  disabled={status === 'streaming'}
                />
                <TooltipButton
                  icon={<Pause className="size-3" />}
                  label="Pause"
                  onClick={onPause}
                  active={status === 'streaming'}
                  disabled={status !== 'streaming'}
                />
                <TooltipButton
                  icon={<Play className="size-3" />}
                  label="Resume"
                  onClick={onResume}
                  active={status === 'paused'}
                  disabled={status !== 'paused'}
                />
                <TooltipButton
                  icon={<Square className="size-3" />}
                  label="Stop"
                  onClick={onStop}
                  active={false}
                  disabled={status === 'idle'}
                />
                <TooltipButton
                  icon={
                    <Activity
                      className={cn(
                        'size-3',
                        sentinelDataReady ? 'text-amber-400' : sentinelActive && 'animate-pulse',
                      )}
                    />
                  }
                  label={
                    sentinelDataReady
                      ? 'Sentinel briefing ready — click to review'
                      : sentinelActive
                        ? 'Sentinel on — click to stop'
                        : 'Sentinel off — click to start'
                  }
                  onClick={onToggleSentinel}
                  active={sentinelActive || sentinelDataReady}
                  variant={sentinelDataReady ? 'amber' : 'red'}
                />
              </div>
              {/* ? icon offset to the right — intentionally unbalanced */}
              <div className="absolute left-full ml-2.5">
                <HelpButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
