import { User } from 'lucide-react';
import { ClaudeIcon } from '@/components/icons/ClaudeIcon';

interface MessageAvatarProps {
  role: 'user' | 'assistant' | 'system';
  isStreaming?: boolean;
}

export function MessageAvatar({ role, isStreaming = false }: MessageAvatarProps) {
  if (role === 'user') {
    return (
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
        <User className="h-3.5 w-3.5 text-primary" />
      </div>
    );
  }

  return (
    <div
      className={[
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg overflow-hidden',
        isStreaming ? 'ring-1 ring-[#D97757]/40 animate-pulse' : '',
      ].join(' ')}
    >
      <ClaudeIcon className="h-6 w-6" />
    </div>
  );
}
