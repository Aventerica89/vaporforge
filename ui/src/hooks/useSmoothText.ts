import { useState, useEffect, useRef } from 'react';

interface UseSmoothTextOptions {
  /** Characters per frame (at 60fps). Default: 2 */
  charsPerFrame?: number;
  /** Immediately show all text (disable smoothing). Default: false */
  disabled?: boolean;
}

/**
 * Accepts raw streaming text and drips it out character-by-character
 * at a controlled rate for smooth visual rendering.
 * When streaming stops, immediately flushes remaining text.
 */
export function useSmoothText(
  rawText: string,
  isStreaming: boolean,
  opts?: UseSmoothTextOptions,
): string {
  const charsPerFrame = opts?.charsPerFrame ?? 2;
  const disabled = opts?.disabled ?? false;

  const [displayed, setDisplayed] = useState(rawText);
  const cursorRef = useRef(0);
  const rafRef = useRef(0);
  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;

  // Flush immediately when streaming stops or smoothing disabled
  useEffect(() => {
    if (!isStreaming || disabled) {
      cancelAnimationFrame(rafRef.current);
      setDisplayed(rawText);
      cursorRef.current = rawText.length;
    }
  }, [isStreaming, disabled, rawText]);

  // rAF loop — runs only while streaming and not disabled
  useEffect(() => {
    if (!isStreaming || disabled) return;

    function tick() {
      const target = rawTextRef.current.length;
      if (cursorRef.current < target) {
        const behind = target - cursorRef.current;
        // Adaptive: catch up faster when far behind to avoid visible lag
        const speed = behind > 200
          ? Math.max(charsPerFrame, Math.ceil(behind * 0.1))
          : charsPerFrame;
        cursorRef.current = Math.min(cursorRef.current + speed, target);
        setDisplayed(rawTextRef.current.slice(0, cursorRef.current));
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isStreaming, disabled, charsPerFrame]);

  return displayed;
}
