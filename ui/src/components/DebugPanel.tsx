import { useState, useRef, useMemo, useCallback, useEffect, Component } from 'react';
import { Bug, X, Download, Maximize2, Minimize2, Clock, BookmarkPlus, Bookmark, Activity, BarChart3 } from 'lucide-react';
import { useDebugLog, type DebugCategory } from '@/hooks/useDebugLog';
import { useStreamDebug } from '@/hooks/useStreamDebug';
import { median, percentile, mean, errorRate } from '@/lib/stats';

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class DebugPanelErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Debug Panel Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-6 right-6 z-50 p-4 border rounded-lg shadow-lg max-w-sm bg-red-500/10 border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <Bug className="w-4 h-4" />
            <span className="font-medium">Debug Panel Error</span>
          </div>
          <p className="text-sm text-red-300 mb-3">
            The debug panel encountered an error but your main application is still working normally.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'timeline' | 'analytics';
type TypeFilter = 'all' | 'error' | 'warn' | 'info';
type WsCategory = 'streaming' | 'container' | 'mcp' | 'auth' | 'system';

interface TimelineEvent {
  id: string;
  timestamp: number;
  message: string;
  type: string;
  messageType?: string;
  category: WsCategory;
  duration: number;
  isBookmarked: boolean;
}

const CATEGORY_LANES: Array<{ id: WsCategory; label: string; color: string }> = [
  { id: 'streaming', label: 'Streaming', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  { id: 'container', label: 'Container', color: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
  { id: 'mcp', label: 'MCP', color: 'bg-purple-500/10 border-purple-500/30 text-purple-400' },
  { id: 'auth', label: 'Auth', color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
  { id: 'system', label: 'System', color: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400' },
];

function mapCategoryFromEntry(cat: DebugCategory): WsCategory {
  switch (cat) {
    case 'stream': return 'streaming';
    case 'sandbox': return 'container';
    case 'mcp': return 'mcp';
    case 'auth': return 'auth';
    default: return 'system';
  }
}

function formatDuration(ms: number): string {
  if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

// ---------------------------------------------------------------------------
// Core Panel
// ---------------------------------------------------------------------------

function DebugPanelCore() {
  const entries = useDebugLog((s) => s.entries);
  const { isOpen, toggle, close } = useDebugLog();
  const bookmarkedIds = useDebugLog((s) => s.bookmarkedIds);
  const toggleBookmark = useDebugLog((s) => s.toggleBookmark);
  const exportEntries = useDebugLog((s) => s.exportEntries);
  const streamMetrics = useStreamDebug((s) => s.metrics);
  const streamEvents = useStreamDebug((s) => s.events);

  const [visible, setVisible] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [wsFilter, setWsFilter] = useState<'all' | WsCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isGeneratingDump, setIsGeneratingDump] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Check localStorage flag on mount
  useEffect(() => {
    const check = () => setVisible(localStorage.getItem('vf_debug') === '1');
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filter !== 'all') {
      result = result.filter((e) => e.level === filter);
    }
    if (filter === 'info' && wsFilter !== 'all') {
      result = result.filter((e) => mapCategoryFromEntry(e.category) === wsFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          (e.detail && e.detail.toLowerCase().includes(q)) ||
          e.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, filter, wsFilter, searchQuery]);

  // Analytics — only compute when open
  const analyticsData = useMemo(() => {
    if (!isOpen || viewMode !== 'analytics') return null;

    const errors = entries.filter((e) => e.level === 'error');
    const warnings = entries.filter((e) => e.level === 'warn');

    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].timestamp).getTime();
      const curr = new Date(entries[i].timestamp).getTime();
      if (curr >= prev) intervals.push(curr - prev);
    }

    const errRate = errorRate(entries);
    const warnRate = entries.length > 0 ? (warnings.length / entries.length) * 100 : 0;

    return {
      totalMessages: entries.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      errorRate: errRate,
      warningRate: warnRate,
      intervals: {
        avg: mean(intervals),
        median: median(intervals),
        p99: percentile(intervals, 99),
      },
      wsMessages: streamEvents.length,
      perfScore: Math.max(0, 100 - errRate),
      streaming: {
        ttft: streamMetrics.ttft,
        duration: streamMetrics.duration,
        tokensPerSec: streamMetrics.tokensPerSec,
      },
    };
  }, [entries, streamEvents, streamMetrics, isOpen, viewMode]);

  // Timeline — only compute when open
  const timelineData = useMemo(() => {
    if (!isOpen || viewMode !== 'timeline') return null;

    const events: TimelineEvent[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const ts = new Date(e.timestamp).getTime();
      const prevTs = i > 0 ? new Date(entries[i - 1].timestamp).getTime() : ts;
      events.push({
        id: e.id,
        timestamp: ts,
        message: e.summary,
        type: e.level,
        messageType: e.category,
        category: mapCategoryFromEntry(e.category),
        duration: i > 0 ? ts - prevTs : 0,
        isBookmarked: bookmarkedIds.has(e.id),
      });
    }

    for (const se of streamEvents) {
      events.push({
        id: se.id,
        timestamp: se.timestamp,
        message: se.preview,
        type: 'info',
        messageType: se.type,
        category: 'streaming',
        duration: 0,
        isBookmarked: false,
      });
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    // Recalculate durations after sorting
    for (let i = 1; i < events.length; i++) {
      events[i] = { ...events[i], duration: events[i].timestamp - events[i - 1].timestamp };
    }

    return { events, lanes: CATEGORY_LANES };
  }, [entries, streamEvents, bookmarkedIds, isOpen, viewMode]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const downloadDump = useCallback(async () => {
    setIsGeneratingDump(true);
    try {
      const dump = {
        timestamp: Date.now(),
        entries: JSON.parse(exportEntries()),
        appState: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vf-debug-${new Date().toISOString().slice(0, 19)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGeneratingDump(false);
    }
  }, [exportEntries]);

  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warningCount = entries.filter((e) => e.level === 'warn').length;

  if (!visible) return null;

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={toggle}
        className={`fixed z-50 p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-105 ${
          (errorCount > 0 || warningCount > 0) && !isOpen
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-card text-muted-foreground border border-border hover:bg-muted'
        }`}
        style={{
          bottom: 'max(env(safe-area-inset-bottom, 0px) + 1.5rem, 1.5rem)',
          right: 'max(env(safe-area-inset-right, 0px) + 1.5rem, 1.5rem)',
        }}
        title={`Debug Console (${errorCount + warningCount} issues)`}
      >
        <Bug className="w-4 h-4" />
        {(errorCount > 0 || warningCount > 0) && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
            {errorCount > 0 ? errorCount : warningCount}
          </span>
        )}
      </button>

      {/* Full-height right-side drawer */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 h-full bg-card shadow-2xl border-l border-border z-[60] transform transition-all duration-300 ease-in-out flex flex-col ${
          isMaximized ? 'w-[80vw]' : 'w-[600px] max-w-[calc(100vw-1rem)]'
        } ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-foreground" />
            <h3 className="font-semibold text-foreground">Debug Console</h3>
            <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full tabular-nums">
              {filteredEntries.length}/{entries.length}
            </span>
            {bookmarkedIds.size > 0 && (
              <span className="bg-yellow-500/10 text-yellow-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Bookmark className="w-3 h-3" />
                {bookmarkedIds.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-muted rounded p-0.5">
              {([
                { key: 'list' as ViewMode, icon: Bug, label: 'List' },
                { key: 'analytics' as ViewMode, icon: BarChart3, label: 'Stats' },
                { key: 'timeline' as ViewMode, icon: Activity, label: 'Timeline' },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-2 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                    viewMode === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={`${label} view`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={downloadDump}
              disabled={isGeneratingDump}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Download debug dump"
            >
              <Download className="w-3 h-3" />
              {isGeneratingDump ? '...' : 'Export'}
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded transition-colors"
              title={isMaximized ? 'Minimize panel' : 'Maximize panel'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={useDebugLog.getState().clearEntries}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 hover:bg-muted rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={close}
              className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-border bg-muted/10">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {([
              { key: 'all' as TypeFilter, label: 'All', count: entries.length },
              { key: 'error' as TypeFilter, label: 'Errors', count: errorCount },
              { key: 'warn' as TypeFilter, label: 'Warnings', count: warningCount },
              { key: 'info' as TypeFilter, label: 'Info', count: entries.filter((e) => e.level === 'info').length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  filter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {/* WS Category sub-filters */}
          {filter === 'info' && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="text-[10px] text-muted-foreground/60 mb-1 font-medium uppercase tracking-wider">
                Category:
              </div>
              <div className="flex gap-1 flex-wrap">
                {([
                  { key: 'all' as const, label: 'All' },
                  ...CATEGORY_LANES.map((l) => ({ key: l.id, label: l.label })),
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setWsFilter(key)}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      wsFilter === key
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-purple-500/5 text-purple-400/60 hover:bg-purple-500/10 border border-purple-500/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'analytics' && analyticsData ? (
            /* Analytics Dashboard */
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-400 tabular-nums">{analyticsData.totalMessages}</div>
                  <div className="text-sm text-blue-300/70">Total Messages</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-400 tabular-nums">{analyticsData.errorRate.toFixed(1)}%</div>
                  <div className="text-sm text-red-300/70">Error Rate</div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-400 tabular-nums">{analyticsData.warningRate.toFixed(1)}%</div>
                  <div className="text-sm text-yellow-300/70">Warning Rate</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-400 tabular-nums">
                    {analyticsData.intervals.avg !== null ? formatDuration(analyticsData.intervals.avg) : '—'}
                  </div>
                  <div className="text-sm text-emerald-300/70">Avg Interval</div>
                </div>
              </div>

              {/* Statistical Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted/30 border border-border/50 p-4 rounded-lg">
                  <h4 className="font-medium text-foreground mb-2">Response Time Statistics</h4>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>Average: <span className="font-mono text-foreground">{analyticsData.intervals.avg !== null ? formatDuration(analyticsData.intervals.avg) : '—'}</span></div>
                    <div>Median: <span className="font-mono text-foreground">{analyticsData.intervals.median !== null ? formatDuration(analyticsData.intervals.median) : '—'}</span></div>
                    <div>P99: <span className="font-mono text-foreground">{analyticsData.intervals.p99 !== null ? formatDuration(analyticsData.intervals.p99) : '—'}</span></div>
                  </div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-lg">
                  <h4 className="font-medium text-purple-300 mb-2 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Stream Activity
                  </h4>
                  <div className="text-lg font-bold text-purple-400 tabular-nums">{analyticsData.wsMessages} events</div>
                  <div className="text-sm text-purple-300/70 mt-1 space-y-0.5">
                    {analyticsData.streaming.ttft !== null && <div>TTFT: {analyticsData.streaming.ttft}ms</div>}
                    {analyticsData.streaming.tokensPerSec !== null && <div>Speed: {analyticsData.streaming.tokensPerSec} tok/s</div>}
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-300 mb-2">Performance Score</h4>
                  <div className={`text-3xl font-bold tabular-nums ${
                    analyticsData.perfScore > 90 ? 'text-emerald-400' :
                    analyticsData.perfScore > 70 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {analyticsData.perfScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-amber-300/70">System Health</div>
                </div>
              </div>

              {/* Bookmarked messages */}
              {bookmarkedIds.size > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
                  <h4 className="font-medium text-yellow-300 mb-3 flex items-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    Bookmarked Messages
                  </h4>
                  <div className="space-y-2">
                    {entries.filter((e) => bookmarkedIds.has(e.id)).slice(0, 5).map((e) => (
                      <div key={e.id} className="text-sm text-yellow-300/70 truncate">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(e.timestamp).toLocaleTimeString()}: {e.summary}
                      </div>
                    ))}
                    {bookmarkedIds.size > 5 && (
                      <div className="text-xs text-yellow-400/50">+{bookmarkedIds.size - 5} more...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'timeline' && timelineData ? (
            /* Timeline View */
            <div className="p-4">
              {timelineData.events.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Timeline ({timelineData.events.length} events)
                    </h4>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {timelineData.events.length >= 2
                        ? formatDuration(
                            timelineData.events[timelineData.events.length - 1].timestamp -
                            timelineData.events[0].timestamp,
                          )
                        : '0ms'}
                    </div>
                  </div>

                  {/* Lane Legend */}
                  <div className="flex flex-wrap gap-2">
                    {timelineData.lanes.map((lane) => (
                      <div key={lane.id} className={`px-3 py-1 rounded text-xs font-medium border ${lane.color}`}>
                        {lane.label}
                      </div>
                    ))}
                  </div>

                  {/* Timeline Events */}
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {timelineData.events.map((event, index) => {
                        const lane = timelineData.lanes.find((l) => l.id === event.category) || timelineData.lanes[4];
                        const relativeTime = index > 0
                          ? event.timestamp - timelineData.events[0].timestamp
                          : 0;

                        return (
                          <div key={event.id} className="relative flex items-start">
                            {/* Timeline marker */}
                            <div
                              className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${lane.color} ${
                                event.isBookmarked ? 'ring-2 ring-yellow-400' : ''
                              }`}
                            >
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  event.type === 'error'
                                    ? 'bg-red-500'
                                    : event.type === 'warn'
                                    ? 'bg-yellow-500'
                                    : 'bg-blue-500'
                                }`}
                              />
                            </div>

                            {/* Event content */}
                            <div className="ml-4 flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded border ${lane.color}`}>
                                    {lane.label}
                                  </span>
                                  {event.messageType && (
                                    <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded font-mono">
                                      {event.messageType}
                                    </span>
                                  )}
                                  {event.isBookmarked && (
                                    <Bookmark className="w-3 h-3 text-yellow-400 fill-current" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                                  <span>+{formatDuration(relativeTime)}</span>
                                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                                </div>
                              </div>
                              <div className="mt-1 text-sm text-foreground/80 truncate" title={event.message}>
                                {event.message}
                              </div>
                              {event.duration > 0 && (
                                <div className="mt-0.5 text-xs text-muted-foreground/60">
                                  Delta: {formatDuration(event.duration)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No timeline events to display</p>
                </div>
              )}
            </div>
          ) : (
            /* List View */
            <div className="p-4 space-y-3">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bug className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No messages match your filters</p>
                </div>
              ) : (
                filteredEntries.slice().reverse().map((entry) => {
                  const isExpanded = expandedMessages.has(entry.id);
                  const isBookmarked = bookmarkedIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`border-l-4 rounded-r-lg p-3 pr-10 transition-all relative ${
                        entry.level === 'error'
                          ? 'border-red-500 bg-red-500/10'
                          : entry.level === 'warn'
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-blue-500 bg-blue-500/10'
                      } ${isBookmarked ? 'ring-1 ring-yellow-400/50' : ''}`}
                    >
                      {/* Bookmark Button */}
                      <button
                        onClick={() => toggleBookmark(entry.id)}
                        className={`absolute top-2 right-2 p-1 rounded transition-all ${
                          isBookmarked
                            ? 'text-yellow-400 hover:text-yellow-500'
                            : 'text-muted-foreground/30 hover:text-yellow-400'
                        }`}
                        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                      >
                        {isBookmarked ? (
                          <Bookmark className="w-4 h-4 fill-current" />
                        ) : (
                          <BookmarkPlus className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex items-start justify-between gap-2 mb-1 pr-6">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm capitalize text-foreground">
                            {entry.level}
                          </span>
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-mono">
                            {entry.category}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-sm text-foreground/80 mb-1">
                        {entry.summary}
                      </div>

                      {entry.detail && (
                        <div>
                          <button
                            onClick={() => toggleExpanded(entry.id)}
                            className="text-xs text-primary hover:text-primary/80 underline"
                          >
                            {isExpanded ? 'Hide details' : 'Show details'}
                          </button>
                          {isExpanded && (
                            <pre className="mt-2 text-xs bg-background p-2 rounded overflow-x-auto text-muted-foreground whitespace-pre-wrap max-h-40 border border-border/50">
                              {entry.detail}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Frosted Glass Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 transition-all duration-300"
          onClick={close}
          style={{
            backdropFilter: 'blur(8px) saturate(180%)',
            WebkitBackdropFilter: 'blur(8px) saturate(180%)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Export with Error Boundary
// ---------------------------------------------------------------------------

export function DebugPanel() {
  return (
    <DebugPanelErrorBoundary>
      <DebugPanelCore />
    </DebugPanelErrorBoundary>
  );
}
