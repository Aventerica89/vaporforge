import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSandboxStore } from '../useSandbox';

// Mock sendWsCommand so we can verify WS messages without a real socket
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api');
  return {
    ...actual,
    sendWsCommand: vi.fn(),
  };
});

// Re-import the mocked version for assertions
import { sendWsCommand } from '@/lib/api';
const mockSendWs = sendWsCommand as ReturnType<typeof vi.fn>;

function resetStore() {
  useSandboxStore.setState({
    isStreaming: false,
    isPaused: false,
    pausedAt: null,
    streamAbortController: null,
    streamingContent: '',
    streamingParts: [],
  });
}

describe('pauseStreaming / resumeStreaming', () => {
  beforeEach(() => {
    resetStore();
    mockSendWs.mockClear();
  });

  it('pauseStreaming sends { type: "pause" } and sets isPaused + pausedAt when streaming', () => {
    useSandboxStore.setState({ isStreaming: true });
    const before = Date.now();

    useSandboxStore.getState().pauseStreaming();

    const state = useSandboxStore.getState();
    expect(mockSendWs).toHaveBeenCalledWith({ type: 'pause' });
    expect(state.isPaused).toBe(true);
    expect(state.pausedAt).toBeGreaterThanOrEqual(before);
    expect(state.pausedAt).toBeLessThanOrEqual(Date.now());
  });

  it('pauseStreaming is a no-op when not streaming', () => {
    useSandboxStore.setState({ isStreaming: false });

    useSandboxStore.getState().pauseStreaming();

    expect(mockSendWs).not.toHaveBeenCalled();
    expect(useSandboxStore.getState().isPaused).toBe(false);
    expect(useSandboxStore.getState().pausedAt).toBeNull();
  });

  it('pauseStreaming is a no-op when already paused', () => {
    useSandboxStore.setState({ isStreaming: true, isPaused: true, pausedAt: 1000 });

    useSandboxStore.getState().pauseStreaming();

    expect(mockSendWs).not.toHaveBeenCalled();
    // State unchanged
    expect(useSandboxStore.getState().isPaused).toBe(true);
    expect(useSandboxStore.getState().pausedAt).toBe(1000);
  });

  it('resumeStreaming sends { type: "resume" } and clears isPaused + pausedAt when paused', () => {
    useSandboxStore.setState({ isStreaming: true, isPaused: true, pausedAt: Date.now() });

    useSandboxStore.getState().resumeStreaming();

    const state = useSandboxStore.getState();
    expect(mockSendWs).toHaveBeenCalledWith({ type: 'resume' });
    expect(state.isPaused).toBe(false);
    expect(state.pausedAt).toBeNull();
  });

  it('resumeStreaming is a no-op when not paused', () => {
    useSandboxStore.setState({ isStreaming: true, isPaused: false });

    useSandboxStore.getState().resumeStreaming();

    expect(mockSendWs).not.toHaveBeenCalled();
    expect(useSandboxStore.getState().isPaused).toBe(false);
  });

  it('stopStreaming resets isPaused and pausedAt', () => {
    useSandboxStore.setState({
      isStreaming: true,
      isPaused: true,
      pausedAt: Date.now(),
      streamAbortController: new AbortController(),
    });

    useSandboxStore.getState().stopStreaming();

    const state = useSandboxStore.getState();
    expect(state.isPaused).toBe(false);
    expect(state.pausedAt).toBeNull();
    expect(state.isStreaming).toBe(false);
  });
});
