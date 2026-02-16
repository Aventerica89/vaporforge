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
    // chat(1) -> files(2) = swipe left (forward)
    act(() => result.current.setActiveTab('files'));
    expect(result.current.swipeDirection).toBe('left');
    // files(2) -> chat(1) = swipe right (backward)
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

  it('does not change swipe direction when selecting the same tab', () => {
    const { result } = renderHook(() => useMobileNav());
    // default is chat, selecting chat again should not change direction from null
    act(() => result.current.setActiveTab('chat'));
    expect(result.current.swipeDirection).toBeNull();
  });

  it('handles home tab correctly', () => {
    const { result } = renderHook(() => useMobileNav());
    // chat(1) -> home(0) = right
    act(() => result.current.setActiveTab('home'));
    expect(result.current.activeTab).toBe('home');
    expect(result.current.swipeDirection).toBe('right');
  });

  it('tracks direction for multi-hop jumps', () => {
    const { result } = renderHook(() => useMobileNav());
    // chat(1) -> terminal(3) = left
    act(() => result.current.setActiveTab('terminal'));
    expect(result.current.swipeDirection).toBe('left');
    // terminal(3) -> chat(1) = right
    act(() => result.current.setActiveTab('chat'));
    expect(result.current.swipeDirection).toBe('right');
  });
});
