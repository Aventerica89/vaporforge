**Added:** 2026-03-18
**Status:** Active Research
**Category:** UX / Streaming

## Problem

Text streaming in VaporForge is choppy. WS tokens arrive in bursts (not individual characters), causing visible pop-in chunks. Competitors smooth this differently:

- **ChatGPT:** Controlled character drip (clearly buffered/smoothed)
- **Gemini:** Fade-in on burst chunks
- **Claude.ai:** Similar burst pattern, less smoothing visible

## Current Architecture

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

## What We Tried (2026-03-18)

### Experiment: Remove useSmoothText, let Streamdown handle it

**Hypothesis:** Streamdown's built-in `animated` + `isAnimating` mode would handle streaming gracefully without the extra rAF layer.

**Result:** Worse. Without smoothing, WS burst chunks pop in as full sentences/paragraphs. The underlying transport delivers tokens in bursts, not individually. Smoothing is necessary.

**Shipped:** Feature-flagged toggle in Settings > Appearance > Streaming. Default: smooth OFF (for A/B comparison). Toggle ON re-enables useSmoothText.

Commit: `f6b5189` — `feat: add smooth streaming toggle`

## Options Going Forward

### Option A: Simplify useSmoothText algorithm
Replace the 5-tier system with a single smooth curve. Ideas:
- Constant chars/frame (e.g., 6 chars at 60fps = ~360 chars/sec)
- Remove word-boundary snapping (let characters land mid-word)
- Simple linear interpolation instead of sqrt-based tiers
- CSS transition on opacity for newly revealed text (fade-in effect like Gemini)

### Option B: CSS-based fade-in on chunks
Instead of character-by-character drip, render full chunks but fade them in:
- Each new text delta gets wrapped in a span with `animate-fadeIn`
- No rAF loop needed — CSS handles the animation
- Simpler, more performant, closer to Gemini's approach

### VERIFIED: execStream and streamProcessLogs NOW STREAM (2026-03-18)

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

**Impact:** The WS bridge in ChatSessionAgent (~500 lines) was built to work around execStream buffering. That buffering is fixed. New features can use `streamProcessLogs` natively instead of the custom WS bridge. Migration of main chat path is a v2.0 task.

### Option C: Workers AI streaming via CF Agents framework
From https://developers.cloudflare.com/agents/api-reference/using-ai-models/:
- `createWorkersAI()` provider works with AI SDK's `streamText`
- Native `for await (const chunk of result.textStream)` in Agent class
- CF AI Gateway provides caching, rate limiting, model routing
- Could improve token delivery granularity at the transport level

### Option D: Hybrid — simpler smoothing + fade
Combine a simpler rAF loop (constant speed, no tiers) with CSS opacity transition on new content. Best of both worlds.

## Vertical Jump Bug (Reflow Flash)

Separate from smoothing — when streaming completes, the message re-renders with different styling/height (streaming mode → static mode transition). This causes a visible scroll jump.

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
