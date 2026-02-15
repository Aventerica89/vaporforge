import { usePromptInput } from './context';
import { cn } from '@/lib/cn';

interface PromptInputHintProps {
  className?: string;
}

export function PromptInputHint({ className }: PromptInputHintProps) {
  const { compact } = usePromptInput();

  if (compact) return null;

  return (
    <p className={cn('mt-1.5 text-center text-[10px] text-muted-foreground/40', className)}>
      Enter or Cmd+Enter to send, Shift+Enter for new line
    </p>
  );
}
