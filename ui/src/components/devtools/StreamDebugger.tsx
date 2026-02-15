import { useRef, useEffect, useState } from 'react';
import { useStreamDebug, type StreamEvent } from '@/hooks/useStreamDebug';

const TYPE_COLORS: Record<string, string> = {
  text: 'text-success',
  reasoning: 'text-secondary',
  'tool-start': 'text-primary',
  'tool-result': 'text-primary/70',
  error: 'text-error',
  done: 'text-muted-foreground',
  connected: 'text-muted-foreground/50',
  heartbeat: 'text-muted-foreground/30',
};

function EventRow({ event }: { event: StreamEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const colorClass = TYPE_COLORS[event.type] || 'text-foreground';

  return (
    <div className="flex gap-2 px-2 py-0.5 text-[10px] font-mono hover:bg-muted/20">
      <span className="flex-shrink-0 text-muted-foreground/50 tabular-nums">
        {time}
      </span>
      <span className={`flex-shrink-0 w-20 truncate ${colorClass}`}>
        {event.type}
      </span>
      <span className="flex-shrink-0 w-10 text-right text-muted-foreground/40 tabular-nums">
        {event.dataSize}b
      </span>
      <span className="min-w-0 truncate text-muted-foreground/70">
        {event.preview}
      </span>
    </div>
  );
}

export function StreamDebugger() {
  const events = useStreamDebug((s) => s.events);
  const [filter, setFilter] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const filtered = filter
    ? events.filter((e) => e.type.includes(filter))
    : events;

  return (
    <div className="flex h-64 flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by type..."
          className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        <span className="text-[10px] tabular-nums text-muted-foreground/40">
          {filtered.length}/{events.length}
        </span>
      </div>

      {/* Event log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground/40">
            {events.length === 0
              ? 'Send a message to see stream events'
              : 'No events match filter'}
          </div>
        ) : (
          filtered.map((event) => (
            <EventRow key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
