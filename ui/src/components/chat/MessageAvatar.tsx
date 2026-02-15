import { Bot, User } from 'lucide-react';

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
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary/10',
        isStreaming ? 'ring-1 ring-secondary/40 animate-pulse' : '',
      ].join(' ')}
    >
      <Bot className="h-3.5 w-3.5 text-secondary" />
    </div>
  );
}
