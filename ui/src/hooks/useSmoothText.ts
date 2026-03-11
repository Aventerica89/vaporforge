import { useState, useEffect, useRef } from 'react';

interface UseSmoothTextOptions {
  /** Characters per frame (at 60fps). Default: 4 */
  charsPerFrame?: number;
  /** Immediately show all text (disable smoothing). Default: false */
  disabled?: boolean;
}

/**
 * Accepts raw streaming text and drips it out character-by-character
 * at a controlled rate for smooth visual rendering.
 *
 * Uses refs so the rAF loop always reads live values without re-triggering
 * the animation effect — critical for handling the case where isStreaming
 * transitions to false in the same React batch as the final text arriving
 * (TCP Nagle pop-in fix). When streaming has ended but the cursor is still
 * behind, the loop uses faster catch-up instead of immediately flushing.
 */
export function useSmoothText(
  rawText: string,
  isStreaming: boolean,
  opts?: UseSmoothTextOptions,
): string {
  const charsPerFrame = opts?.charsPerFrame ?? 4;
  const disabled = opts?.disabled ?? false;

  // Always start at '' — animation always begins from the beginning.
  // (Historical/non-streaming messages should use ChatMarkdown, not SmoothText.)
  const [displayed, setDisplayed] = useState('');
  const cursorRef = useRef(0);
  const rafRef = useRef(0);

  // Refs so rAF loop reads live values without being in the effect dependency array
  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const charsPerFrameRef = useRef(charsPerFrame);
  charsPerFrameRef.current = charsPerFrame;

  // Immediately show text if disabled (e.g. reduced motion)
  useEffect(() => {
    if (disabled) {
      setDisplayed(rawText);
      cursorRef.current = rawText.length;
    }
  }, [disabled, rawText]);

  // Single rAF loop — runs from mount, self-terminates when caught up and done.
  // Not in the isStreaming dependency array so it keeps running after stream ends.
  useEffect(() => {
    if (disabled) return;

    function tick() {
      const text = rawTextRef.current;
      const streaming = isStreamingRef.current;
      const cpf = charsPerFrameRef.current;
      const target = text.length;

      if (cursorRef.current < target) {
        const behind = target - cursorRef.current;
        // When streaming has ended, use faster catch-up so the user doesn't
        // wait for a long tail animation. At 1000 behind: ~95 chars/frame (~170ms).
        const multiplier = streaming ? 1.5 : 3.0;
        const speed = behind > 100
          ? Math.max(cpf, Math.ceil(Math.sqrt(behind) * multiplier))
          : cpf;
        cursorRef.current = Math.min(cursorRef.current + speed, target);
        setDisplayed(text.slice(0, cursorRef.current));
        rafRef.current = requestAnimationFrame(tick);
      } else if (streaming) {
        // Caught up but still streaming — keep polling for more text
        rafRef.current = requestAnimationFrame(tick);
      }
      // else: caught up and not streaming — loop stops naturally
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [disabled]); // intentionally omits isStreaming — loop runs for full lifetime

  return disabled ? rawText : displayed;
}
