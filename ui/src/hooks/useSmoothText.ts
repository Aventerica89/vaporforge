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

  // Reset cursor when a new message starts (rawText resets shorter than current cursor).
  // Needed because SmoothText is keyed by part index — React may reuse the same
  // component instance for a new message at the same position, leaving cursor stale.
  useEffect(() => {
    if (!disabled && rawText.length < cursorRef.current) {
      cursorRef.current = 0;
      setDisplayed('');
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
        const isMidAnimation = cursorRef.current > 0;
        // Three cases when behind > 100:
        // 1. Mid-animation post-stream: 3x fast catch-up (finishing a real-time stream)
        // 2. All-at-once post-stream (cursor=0): ~3s budget so animation is clearly
        //    visible — behind/180 ≈ 9 chars/frame for 1500 chars → ~2.8s
        // 3. Still streaming: moderate 1.5x catch-up to stay close to incoming text
        const speed = behind > 100
          ? isMidAnimation && !streaming
            ? Math.max(cpf, Math.ceil(Math.sqrt(behind) * 3.0))
            : !isMidAnimation && !streaming
            ? Math.max(cpf, Math.ceil(behind / 180))
            : Math.max(cpf, Math.ceil(Math.sqrt(behind) * 1.5))
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
