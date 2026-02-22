import { ArrowUp, Square, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePromptInput } from './context';
import { cn } from '@/lib/cn';
import { GlowEffect } from '@/components/motion-primitives/glow-effect';

// Vapor purple palette for the glow
const VAPOR_COLORS = ['#a855f7', '#d946ef', '#818cf8', '#7c3aed', '#c026d3'];

export function PromptInputSubmit() {
  const { status, hasInput, onStop } = usePromptInput();

  if (status === 'streaming') {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-error/20 hover:text-error"
        title="Stop generating"
      >
        <Square className="h-4 w-4" />
      </button>
    );
  }

  if (status === 'uploading') {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted/50">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {hasInput && (
          <motion.div
            key="glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlowEffect
              colors={VAPOR_COLORS}
              mode="colorShift"
              blur="soft"
              duration={3}
              scale={0.85}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="submit"
        disabled={!hasInput}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-lg transition-all',
          hasInput
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/50 text-muted-foreground/40',
        )}
        title="Send message"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}
