import { Pause, Play, Square, Zap } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { TextShimmer } from '@/components/prompt-kit/text-shimmer';
import { cn } from '@/lib/cn';

export type SessionStatus = 'idle' | 'streaming' | 'paused';

interface SessionIslandProps {
  status: SessionStatus;
  onNew: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
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
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="h-1.5 w-1.5 rounded-full bg-purple-400"
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
}

function TooltipButton({ icon, label, onClick, active, disabled }: TooltipButtonProps) {
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
          'flex size-8 items-center justify-center rounded-full border transition-all duration-200',
          active
            ? 'border-purple-500/50 bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'
            : disabled
              ? 'cursor-not-allowed border-zinc-800/50 bg-zinc-900/30 text-zinc-700'
              : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-purple-500/30 hover:text-zinc-300',
        )}
      >
        {icon}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionIsland
// ---------------------------------------------------------------------------

const ISLAND_CONTENT = {
  idle: <IdleContent />,
  streaming: <StreamingContent />,
  paused: <PausedContent />,
};

export function SessionIsland({
  status,
  onNew,
  onPause,
  onResume,
  onStop,
}: SessionIslandProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pill */}
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
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { delay: 0.05 } }}
            exit={{ opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.25 }}
          >
            {ISLAND_CONTENT[status]}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Button row */}
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
      </div>
    </div>
  );
}
