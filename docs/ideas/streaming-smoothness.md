**Added:** 2026-03-18
**Status:** In Progress
**Category:** UX / Streaming

## Summary

Streaming smoothness improvements: useSmoothText toggle shipped, native stream migration working (feature-flagged), execStream confirmed real-time. WS bridge retained as fallback.

## Problem

Text streaming in VaporForge is choppy. WS tokens arrive in bursts (not individual characters), causing visible pop-in chunks. Competitors smooth this differently:

- **ChatGPT:** Controlled character drip (clearly buffered/smoothed)
- **Gemini:** Fade-in on burst chunks
- **Claude.ai:** Similar burst pattern, less smoothing visible

## What Shipped (2026-03-18)

### 1. Smooth Streaming Toggle

**Settings > Appearance > Streaming** toggle lets users enable/disable `useSmoothText` animation.

- Default: OFF (raw token delivery, no rAF animation layer)
- Toggle ON re-enables useSmoothText character drip
- Allows A/B comparison by users to determine preference

Commit: `f6b5189` — `feat: add smooth streaming toggle`

### 2. Native Stream Migration (Feature-Flagged)

`streamProcessLogs` replaces the custom WS bridge for main chat streaming. Feature-flagged for safe rollout.

- WS bridge still available as fallback (toggle in code)
- Native path uses CF container `streamProcessLogs` API directly
- Eliminates ~400 lines of WS bridge code (when fully migrated)

### 3. execStream Real-Time Delivery Confirmed

**Test results from production (vaporforge.dev):**

**execStream:** Events arrive ~500ms apart — real-time delivery confirmed.
```
+482ms  i=0
+991ms  i=1
+1499ms i=2
+2013ms i=3
+2534ms i=4  ... (continues ~500ms apart)
```

**streamProcessLogs:** Same — ~500ms apart, real-time.
```
+371ms  i=0
+840ms  i=1
+1340ms i=2
+1862ms i=3  ... (continues ~500ms apart)
```

**Impact:** The WS bridge in ChatSessionAgent (~500 lines) was built to work around execStream buffering. That buffering is now fixed upstream by Cloudflare. New features can use `streamProcessLogs` natively.

## Previous Architecture

```
WS frame (NDJSON) → React state update → useSmoothText (rAF buffer) → Streamdown (markdown)
```

`useSmoothText` runs a requestAnimationFrame loop with a 5-tier speed algorithm:
- behind > 100, post-stream mid-animation: 3x fast catch-up
- behind > 100, post-stream from start: ~3s budget reveal
- behind > 100, still streaming: 1.5x catch-up
- behind <= 100, streaming: proportional deceleration
- behind <= 100, post-stream: base speed

**Problems with current approach:**
- Speed tier transitions cause visible speed changes
- Word-boundary snapping creates uneven jumps
- 5-tier algorithm is complex and hard to tune
- Catch-up/stall/catch-up spiky pattern on fast responses

## Experiment Results (2026-03-18)

### Experiment: Remove useSmoothText, let Streamdown handle it

**Hypothesis:** Streamdown's built-in `animated` + `isAnimating` mode would handle streaming gracefully without the extra rAF layer.

**Result:** Worse. Without smoothing, WS burst chunks pop in as full sentences/paragraphs. The underlying transport delivers tokens in bursts, not individually. Smoothing is necessary for perceived quality but should be opt-in until simplified.

## Next Steps

1. **Validate native stream as default** — run native `streamProcessLogs` path as default for a week, monitor for regressions
2. **Remove WS bridge code** — once native stream is proven stable, delete ~400 lines of WS bridge in ChatSessionAgent
3. **Simplify useSmoothText** — replace 5-tier algorithm with single constant-speed drip or CSS fade-in approach
4. **Consider CSS-based fade** — wrap new text deltas in spans with `animate-fadeIn` instead of character-by-character rAF

## Future Options (When Revisiting Smoothing)

### Option A: Simplify useSmoothText algorithm
- Constant chars/frame (e.g., 6 chars at 60fps = ~360 chars/sec)
- Remove word-boundary snapping
- Simple linear interpolation instead of sqrt-based tiers
- CSS transition on opacity for newly revealed text

### Option B: CSS-based fade-in on chunks
- Each new text delta wrapped in span with `animate-fadeIn`
- No rAF loop — CSS handles animation
- Simpler, more performant, closer to Gemini's approach

### Option C: Workers AI streaming via CF Agents framework
- `createWorkersAI()` provider with AI SDK's `streamText`
- CF AI Gateway for caching, rate limiting, model routing
- Could improve token delivery granularity at transport level

### Option D: Hybrid — simpler smoothing + fade
- Simpler rAF loop (constant speed, no tiers) + CSS opacity transition

## Vertical Jump Bug (Reflow Flash)

Separate from smoothing — when streaming completes, the message re-renders with different styling/height (streaming mode to static mode transition). This causes a visible scroll jump.

Tracked in: `project_reflow_flash.md` (memory)

## Key Insight

The problem is NOT the smoothing concept — it's the implementation complexity. A simpler, single-speed animation with CSS fade would likely feel better than the current 5-tier algorithm.

## Files

| File | Role |
|------|------|
| `ui/src/hooks/useSmoothText.ts` | rAF animation loop (current) |
| `ui/src/hooks/useSmoothStreaming.ts` | localStorage toggle for smooth on/off |
| `ui/src/components/chat/StreamingMarkdown.tsx` | Main chat streaming renderer |
| `ui/src/components/chat/MessageContent.tsx` | SmoothText component for parts |
| `ui/src/components/QuickChatPanel.tsx` | StreamingTextPart for QuickChat |
