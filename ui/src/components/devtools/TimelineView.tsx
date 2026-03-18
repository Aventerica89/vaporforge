import { useRef, useEffect, useMemo } from 'react';
import { useDebugLog, type DebugEntry } from '@/hooks/useDebugLog';
import { useStreamDebug } from '@/hooks/useStreamDebug';

interface TimelineEvent {
  id: string;
  timestamp: number;
  category: 'streaming' | 'container' | 'mcp' | 'auth' | 'system';
  type: string;
  summary: string;
  source: 'log' | 'stream';
}

const CATEGORY_COLORS: Record<string, string> = {
  streaming: 'text-emerald-400',
  container: 'text-blue-400',
  mcp: 'text-purple-400',
  auth: 'text-yellow-400',
  system: 'text-zinc-400',
};

const CATEGORY_BG: Record<string, string> = {
  streaming: 'bg-emerald-400/10',
  container: 'bg-blue-400/10',
  mcp: 'bg-purple-400/10',
  auth: 'bg-yellow-400/10',
  system: 'bg-zinc-400/10',
};

function mapCategory(cat: DebugEntry['category']): TimelineEvent['category'] {
  switch (cat) {
    case 'stream': return 'streaming';
    case 'sandbox': return 'container';
    case 'mcp': return 'mcp';
    case 'auth': return 'auth';
    default: return 'system';
  }
}

function formatDelta(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function TimelineRow({ event, deltaMs }: { event: TimelineEvent; deltaMs: number }) {
  const time = new Date(event.timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const colorClass = CATEGORY_COLORS[event.category] || 'text-foreground';
  const bgClass = CATEGORY_BG[event.category] || 'bg-muted/10';

  return (
    <div className="flex gap-1.5 px-2 py-0.5 text-[10px] font-mono hover:bg-primary/10/20">
      <span className="w-12 flex-shrink-0 text-right tabular-nums text-muted-foreground/40">
        {deltaMs > 0 ? formatDelta(deltaMs) : ''}
      </span>
      <span
        className={`flex-shrink-0 rounded px-1 py-px text-[9px] uppercase ${colorClass} ${bgClass}`}
      >
        {event.category.slice(0, 4)}
      </span>
      <span className={`w-16 flex-shrink-0 truncate ${colorClass}`}>
        {event.type}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground/70">
        {event.summary}
      </span>
      <span className="flex-shrink-0 tabular-nums text-muted-foreground/30">
        {time}
      </span>
    </div>
  );
}

export function TimelineView() {
  const logEntries = useDebugLog((s) => s.entries);
  const streamEvents = useStreamDebug((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => {
    const merged: TimelineEvent[] = [];

    for (const entry of logEntries) {
      merged.push({
        id: entry.id,
        timestamp: new Date(entry.timestamp).getTime(),
        category: mapCategory(entry.category),
        type: entry.level,
        summary: entry.summary,
        source: 'log',
      });
    }

    for (const event of streamEvents) {
      merged.push({
        id: event.id,
        timestamp: event.timestamp,
        category: 'streaming',
        type: event.type,
        summary: event.preview,
        source: 'stream',
      });
    }

    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }, [logEntries, streamEvents]);

  const totalDuration = timeline.length >= 2
    ? timeline[timeline.length - 1].timestamp - timeline[0].timestamp
    : 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  return (
    <div className="flex h-64 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-2 py-1">
        <span className="text-[10px] text-muted-foreground/60">
          Timeline
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/40">
          {timeline.length} events
          {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
        </span>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground/40">
            No events yet
          </div>
        ) : (
          timeline.map((event, i) => {
            const deltaMs = i > 0 ? event.timestamp - timeline[i - 1].timestamp : 0;
            return <TimelineRow key={event.id} event={event} deltaMs={deltaMs} />;
          })
        )}
      </div>
    </div>
  );
}
