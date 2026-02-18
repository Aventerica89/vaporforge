# Agency Editor v2 — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Replaces:** 2026-02-17-agency-editor-design.md

---

## Problem Statement

Agency Mode has three distinct bugs blocking real use:

1. **Inspector granularity** — `vf-inspector.js` only selects `[data-vf-component]` root
   elements (entire sections). Buttons, headings, images inside components cannot be
   targeted. The component tree shows sections only, no child elements.

2. **Edits flash, nothing changes** — After the AI completes an edit via WebSocket, the
   iframe never reloads. HMR is disabled (`vf-hmr-disabled` patch), so the Astro dev
   server does not push updates to the browser. The user sees no visual feedback.

3. **AI has insufficient context** — The prompt sends only `file: HeroCentered.astro` +
   user instruction. The AI doesn't see the actual file source or which specific element
   was clicked. Structural edits ("add a button next to this one") require knowing the
   surrounding HTML, not just the filename.

---

## Solution Architecture

### Phase 1 — Fix Inspector + Iframe Reload (critical path)

**Inspector granularity fix:**

The `closest()` function in `INSPECTOR_LINES` currently returns the `[data-vf-component]`
root as both the highlight target AND the selection. Change it to return the **specific
element** as the highlight/selection target while still walking up to find the component
file path.

```
Before: hover button → highlight entire HeroSection → click → send { file: Hero.astro }
After:  hover button → highlight button → click → send { file: Hero.astro, elementTag: 'button', elementHTML: '<button...>' }
```

The `postMessage` payload expands to include:
- `elementTag` — the clicked element's tag name (button, h1, a, img, etc.)
- `elementHTML` — the element's outerHTML, capped at 1000 chars
- `elementText` — textContent stripped, capped at 100 chars

**Iframe reload fix:**

After the WS stream closes in `AgencyEditor.tsx`, force-reload the iframe:
```typescript
iframeRef.current.src = iframeRef.current.src; // triggers full page reload
```

Also add a `vf-reload` postMessage listener in the inspector (for future programmatic
reloads from the Worker without touching the iframe src directly).

---

### Phase 2 — Rich AI Context (surgical edits)

The AI needs the **actual source file content** to make precise structural edits like
"add a second button next to this one." Without the source, it guesses structure.

**New backend endpoint:**
`GET /api/agency/sites/:id/source?file=src/components/heroes/HeroCentered.astro`

Returns the file's current content from `/workspace/${file}` in the container via
`execInSandbox`. File path is sanitized (no `..`, must be `.astro`).

**Updated `handleAgencyEditWs` prompt:**

The `fullPrompt` gains two new sections:
1. `Selected element:` — the clicked element's outerHTML (from new `elementHTML` WS param)
2. `Current file source:` — the full file content fetched from the container before WS connect

This transforms the AI's task from "guess where to add the button" to "here's the exact
file, here's the exact element the user clicked, add a button next to it."

**Updated frontend flow:**
1. User clicks button in iframe
2. EditPanel receives `{ file, elementTag, elementHTML, elementText }`
3. User types instruction → submits
4. `handleSendEdit` passes `elementHTML` as new WS query param

---

### Phase 3 — Astro Docs MCP Injection

Inject the Astro documentation MCP server into every agency session's Claude config.
This gives the Claude agent in the container access to Astro docs (component props,
island syntax, integration guides) while making edits.

**Why this matters:** Claude writes syntactically invalid Astro less often when it can
look up correct island syntax (`client:load`, `client:visible`), correct frontmatter
patterns, and correct component import formats.

**Implementation:** Same pattern as Gemini MCP injection. In `kickoffAgencySetup`,
after the container is ready, write an MCP config entry for:
```
https://mcp.docs.astro.build/mcp  (HTTP transport)
```

---

### Phase 4 — Inline Text Editing (direct, no AI)

For simple content changes (heading text, button labels, paragraph copy), AI is
unnecessary overhead. A direct contenteditable approach writes back to the `.astro`
source immediately.

**Mechanism:**
- User double-clicks a text element → `contenteditable="true"` activates in-place
- On blur: inspector sends `{ type: 'vf-text-edit', file, selector, newText }` to parent
- Worker reads the file, replaces the matched text node, writes back

This is Phase 4 — after the core bugs are fixed.

---

## Data Flow (Phase 1 + 2)

```
User hovers <button> in iframe
  → vf-inspector.js mousemove
  → e.target = <button> element
  → find [data-vf-component] ancestor = HeroCentered root
  → place hover box on <button> (specific element, not root)
  → show label "button in HeroCentered"

User clicks <button>
  → vf-inspector.js click handler
  → e.preventDefault()
  → postMessage vf-select {
      component: "HeroCentered",
      file: "src/components/heroes/HeroCentered.astro",
      elementTag: "button",
      elementHTML: "<button class=\"btn btn-primary\">Book Consultation</button>",
      elementText: "Book Consultation"
    }
  → AgencyEditor receives message → setSelectedComponent(...)
  → EditPanel shows: "button in HeroCentered.astro — 'Book Consultation'"

User types "add another button 'Learn More' next to this one" → sends

  handleSendEdit(instruction, componentFile, elementHTML)
    → Worker builds fullPrompt:
        Edit the file: src/components/heroes/HeroCentered.astro

        Selected element:
        <button class="btn btn-primary">Book Consultation</button>

        Task: add another button 'Learn More' next to this one

        Current file source:
        [full .astro file content — fetched via execInSandbox]

        Rules:
        - Edit ONLY src/components/heroes/HeroCentered.astro
        - Add the new element adjacent to the selected element above
        - Preserve data-vf-component and data-vf-file attributes
        - Keep component syntactically valid Astro

    → WS connect → claude-agent.js → Claude SDK → makes edit → file saved
    → WS closes

  handleSendEdit resolves
    → commit changes
    → iframeRef.current.src = iframeRef.current.src  ← NEW: force reload
    → user sees updated page with two buttons
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/agency-inspector.ts` | `closest()` returns specific element; postMessage adds elementTag/HTML/text; vf-reload listener |
| `src/api/agency.ts` | New GET /source endpoint; `handleAgencyEditWs` accepts elementHTML, fetches file source |
| `ui/src/components/agency/AgencyEditor.tsx` | Reload iframe after edit; pass elementHTML to handleSendEdit; update ComponentInfo type |
| `ui/src/components/agency/EditPanel.tsx` | Show element tag + text preview in header; pass elementHTML up |
| `src/sandbox.ts` | `kickoffAgencySetup` injects Astro MCP config (Phase 3) |

---

## Non-Goals (explicitly deferred)

- Drag-and-drop layout reordering (Phase 4+)
- Schema-driven block system (v2.0)
- tweakcn color picker panel (after Phase 1-2 are stable)
- Undo/redo (the Undo buttons in EditPanel already exist as stubs)
- Piny integration (cloud-only, not embeddable)
- CloudCannon Bookshop (too heavy for arbitrary repos)
