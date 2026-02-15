import { create } from 'zustand';

export interface StreamEvent {
  id: string;
  type: string;
  timestamp: number;
  dataSize: number;
  preview: string;
}

export interface StreamMetrics {
  ttft: number | null;       // Time to first text token (ms)
  duration: number | null;   // Total stream duration (ms)
  tokensPerSec: number | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

interface StreamDebugState {
  events: StreamEvent[];
  metrics: StreamMetrics;
  streamStartTime: number | null;
  firstTextTime: number | null;
  totalChars: number;

  recordEvent: (type: string, data: string, timestamp?: number) => void;
  startStream: () => void;
  endStream: () => void;
  reset: () => void;
}

const INITIAL_METRICS: StreamMetrics = {
  ttft: null,
  duration: null,
  tokensPerSec: null,
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
};

export const useStreamDebug = create<StreamDebugState>((set, get) => ({
  events: [],
  metrics: { ...INITIAL_METRICS },
  streamStartTime: null,
  firstTextTime: null,
  totalChars: 0,

  recordEvent: (type: string, data: string, timestamp?: number) => {
    const now = timestamp || Date.now();
    const state = get();

    const event: StreamEvent = {
      id: `evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: now,
      dataSize: data.length,
      preview: data.slice(0, 80),
    };

    // Track first text token
    let firstTextTime = state.firstTextTime;
    let totalChars = state.totalChars;
    const metrics = { ...state.metrics };

    if (type === 'text' && !firstTextTime && state.streamStartTime) {
      firstTextTime = now;
      metrics.ttft = now - state.streamStartTime;
    }

    if (type === 'text') {
      totalChars += data.length;
      // Rough estimate: ~4 chars per token
      metrics.estimatedOutputTokens = Math.ceil(totalChars / 4);

      // Update tokens/sec
      if (firstTextTime && now > firstTextTime) {
        const elapsed = (now - firstTextTime) / 1000;
        metrics.tokensPerSec = elapsed > 0
          ? Math.round(metrics.estimatedOutputTokens / elapsed)
          : null;
      }
    }

    // Keep last 100 events
    const events = [...state.events, event].slice(-100);

    set({ events, firstTextTime, totalChars, metrics });
  },

  startStream: () => {
    set({
      events: [],
      metrics: { ...INITIAL_METRICS },
      streamStartTime: Date.now(),
      firstTextTime: null,
      totalChars: 0,
    });
  },

  endStream: () => {
    const state = get();
    const now = Date.now();
    const metrics = { ...state.metrics };

    if (state.streamStartTime) {
      metrics.duration = now - state.streamStartTime;
    }

    set({ metrics });
  },

  reset: () => {
    set({
      events: [],
      metrics: { ...INITIAL_METRICS },
      streamStartTime: null,
      firstTextTime: null,
      totalChars: 0,
    });
  },
}));
