import { useState, useEffect } from 'react';

interface MessageTimestampProps {
  timestamp: string;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAbsoluteTime(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const [, setTick] = useState(0);
  const date = new Date(timestamp);

  // Re-render every 30s to update relative time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <time
      dateTime={timestamp}
      title={formatAbsoluteTime(date)}
      className="text-[10px] tabular-nums text-muted-foreground/50 select-none"
    >
      {formatRelativeTime(date)}
    </time>
  );
}
