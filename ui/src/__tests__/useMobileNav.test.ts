import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileNav } from '../hooks/useMobileNav';

describe('useMobileNav', () => {
  it('defaults to chat tab', () => {
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.activeTab).toBe('chat');
  });

  it('switches tab', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => result.current.setActiveTab('files'));
    expect(result.current.activeTab).toBe('files');
  });

  it('resets to chat when session changes', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => result.current.setActiveTab('terminal'));
    act(() => result.current.onSessionChange());
    expect(result.current.activeTab).toBe('chat');
  });

  it('tracks swipe direction for animation', () => {
    const { result } = renderHook(() => useMobileNav());
    // chat(0) -> files(1) = swipe left (forward)
    act(() => result.current.setActiveTab('files'));
    expect(result.current.swipeDirection).toBe('left');
    // files(1) -> chat(0) = swipe right (backward)
    act(() => result.current.setActiveTab('chat'));
    expect(result.current.swipeDirection).toBe('right');
  });

  it('initializes swipe direction as null', () => {
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.swipeDirection).toBeNull();
  });

  it('clears swipe direction on session change', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => result.current.setActiveTab('terminal'));
    expect(result.current.swipeDirection).not.toBeNull();
    act(() => result.current.onSessionChange());
    expect(result.current.swipeDirection).toBeNull();
  });
});
