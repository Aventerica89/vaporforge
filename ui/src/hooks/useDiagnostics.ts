import { create } from 'zustand';

export interface ContainerHealth {
  sdkVersion: string | null;
  buildDate: string | null;
  nodeVersion: string | null;
  crashCount: number;
  lastCrashReason: string | null;
  lastCrashAt: string | null;
  sessionCreateLatencyMs: number | null;
}

export interface StderrEntry {
  id: string;
  timestamp: string;
  text: string;
}

interface DiagnosticsState {
  container: ContainerHealth;
  stderrLog: StderrEntry[];

  // Actions
  setContainerInfo: (info: { sdkVersion: string; buildDate: string; nodeVersion: string }) => void;
  recordCrash: (reason: string) => void;
  recordSessionLatency: (ms: number) => void;
  addStderr: (text: string) => void;
  reset: () => void;
}

const INITIAL_CONTAINER: ContainerHealth = {
  sdkVersion: null,
  buildDate: null,
  nodeVersion: null,
  crashCount: 0,
  lastCrashReason: null,
  lastCrashAt: null,
  sessionCreateLatencyMs: null,
};

const MAX_STDERR = 100;

export const useDiagnostics = create<DiagnosticsState>((set) => ({
  container: { ...INITIAL_CONTAINER },
  stderrLog: [],

  setContainerInfo: (info) =>
    set((state) => ({
      container: {
        ...state.container,
        sdkVersion: info.sdkVersion,
        buildDate: info.buildDate,
        nodeVersion: info.nodeVersion,
      },
    })),

  recordCrash: (reason) =>
    set((state) => ({
      container: {
        ...state.container,
        crashCount: state.container.crashCount + 1,
        lastCrashReason: reason,
        lastCrashAt: new Date().toISOString(),
      },
    })),

  recordSessionLatency: (ms) =>
    set((state) => ({
      container: {
        ...state.container,
        sessionCreateLatencyMs: ms,
      },
    })),

  addStderr: (text) =>
    set((state) => ({
      stderrLog: [
        ...state.stderrLog,
        {
          id: `stderr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          text,
        },
      ].slice(-MAX_STDERR),
    })),

  reset: () =>
    set({
      container: { ...INITIAL_CONTAINER },
      stderrLog: [],
    }),
}));

// Wire up global events from useSandbox stream handlers
if (typeof window !== 'undefined') {
  window.addEventListener('vf:system-info', ((e: CustomEvent) => {
    const { sdkVersion, buildDate, nodeVersion } = e.detail;
    useDiagnostics.getState().setContainerInfo({
      sdkVersion: sdkVersion || 'unknown',
      buildDate: buildDate || 'unknown',
      nodeVersion: nodeVersion || 'unknown',
    });
  }) as EventListener);
}
