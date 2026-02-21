import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PromptInputToolsProps {
  children: ReactNode;
  className?: string;
}

export function PromptInputTools({ children, className }: PromptInputToolsProps) {
  return (
    <div className={cn('mb-3 flex items-center gap-2 overflow-x-auto scrollbar-none', className)}>
      {children}
    </div>
  );
}
