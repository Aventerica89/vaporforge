import { Eye, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PromptInputModeToggleProps {
  mode: 'agent' | 'plan';
  onModeChange: (mode: 'agent' | 'plan') => void;
}

export function PromptInputModeToggle({
  mode,
  onModeChange,
}: PromptInputModeToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onModeChange(mode === 'agent' ? 'plan' : 'agent')}
      className={cn(
        'flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium transition-colors',
        mode === 'plan'
          ? 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25'
          : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground',
      )}
      title={
        mode === 'plan'
          ? 'Plan mode: read-only research (no file writes)'
          : 'Agent mode: full access (can edit files)'
      }
    >
      {mode === 'plan' ? (
        <>
          <Eye className="h-3 w-3" /> Plan
        </>
      ) : (
        <>
          <Zap className="h-3 w-3" /> Agent
        </>
      )}
    </button>
  );
}
