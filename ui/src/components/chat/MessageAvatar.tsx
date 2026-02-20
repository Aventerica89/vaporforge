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
    <div className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center">
      <ClaudeIcon className="h-5 w-5" />
      {isStreaming && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D97757] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D97757]" />
        </span>
      )}
    </div>
  );
}
