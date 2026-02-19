# Agency Mode — Code Mode Design

**Date:** 2026-02-19
**Status:** Approved

## Goal

Add a Code Mode toggle to Agency Editor that splits the center column into a live preview (top) and dual Monaco editors (bottom: .astro file + CSS file). The right panel becomes an Inline AI chat that streams generated CSS/HTML directly into the active editor with auto-save triggering Astro HMR.

## Architecture

Two distinct modes in Agency Editor, toggled by a `</>` toolbar button:

- **Chat Mode** (default): Current layout — preview + AI Agent panel (full SDK pipeline)
- **Code Mode**: Preview top, Monaco editors bottom, Inline AI in right panel (direct streamText, no agent)

## Layout

### Chat Mode (current, unchanged)
```
[Tree sidebar] | [Toolbar                              ]
               | [Preview iframe — full height         ] | [AI Agent Panel]
```

### Code Mode
```
[Tree sidebar] | [Toolbar — </> active                 ]
               | [Preview iframe — top 55%             ] | [Inline AI Panel]
               | [─── drag handle (resizable) ─────────] | [               ]
               | [.astro Monaco  |  .css Monaco         ] | [               ]
```

All panels are collapsible:
- Tree: collapse button on right edge of sidebar
- Code editors: collapse button on top of pane or `Cmd+Shift+\`
- Right panel: collapse button or `Cmd+Shift+I`

## Keyboard Shortcuts

| Action | Shortcut | Notes |
|---|---|---|
| Toggle Code Mode | `Cmd+Shift+E` | No macOS/VF conflicts |
| Collapse/expand tree | `Cmd+\` | VS Code convention |
| Collapse/expand code editors | `Cmd+Shift+\` | |
| Collapse/expand right panel | `Cmd+Shift+I` | I for Inspector |
| Focus Astro editor | `Cmd+1` | Code Mode only |
| Focus CSS editor | `Cmd+2` | Code Mode only |

Existing VaporForge shortcuts preserved: `Cmd+Shift+Q` (QuickChat), `Cmd+Shift+T` (Transform), `Cmd+Shift+A` (Analysis), `Cmd+Shift+O` (close window).

## Data Flow

### Entering Code Mode
1. `codeMode` state flips to `true`
2. `GET /api/agency/sites/:id/file?path=<componentFile>` → loads .astro source into left Monaco
3. Search for associated CSS: check `src/styles/global.css`, scoped CSS, or inline `<style>` block → loads into right Monaco
4. EditPanel unmounts; AgencyInlineAI mounts in right panel

### Auto-save (Monaco → container)
```
User types → 1s debounce → PUT /api/agency/sites/:id/file { path, content }
→ sandboxManager.writeFile() → Astro HMR detects change → preview reloads
```

### Inline AI (right panel in Code Mode)
```
User: "add box shadow and hover state to .hero-btn"
→ POST /api/agency/sites/:id/inline-ai { prompt, cssContext, elementContext, targetPane }
→ streamText (Gemini Flash preferred, Claude Haiku fallback)
→ SSE stream → client appends/replaces content in active Monaco pane
→ auto-save triggers → HMR → preview updates
```

The Inline AI is intentionally lightweight — no file tools, no agent loop. It receives:
- Current content of the active pane (CSS or Astro)
- Selected element info (class, tag, HTML snippet)
- User prompt

It returns raw CSS or Astro markup to insert.

## Components

### New

**`AgencyCodePane.tsx`**
- Props: `siteId`, `astroFile`, `cssFile`, `onAstroChange`, `onCssChange`
- Two Monaco editors side by side with a vertical drag handle (`react-resizable-panels`)
- Language detection: `astro` for .astro files, `css` for .css
- Collapse button on top bar
- Exposes `insertAtCursor(pane, text)` ref method for Inline AI insertion

**`AgencyInlineAI.tsx`**
- Props: `siteId`, `selectedComponent`, `activePane ('astro' | 'css')`, `onInsert(text)`
- Prompt input at bottom, streaming response above
- "Insert" button applies streamed text to the active Monaco pane via `onInsert`
- Shows which pane is active (Astro / CSS pill indicator)
- Collapsible

### Modified

**`AgencyEditor.tsx`**
- Add `codeMode: boolean` state
- Add `</>` button to toolbar (after viewport presets)
- In Code Mode: center column uses `react-resizable-panels` for vertical split
- Register keyboard shortcuts via `useEffect` + `keydown` handler
- Pass `onInsert` callback from AgencyInlineAI to AgencyCodePane

**`EditPanel.tsx`**
- No changes — just conditionally rendered (`!codeMode`)

**`src/api/agency.ts`**
- `GET /api/agency/sites/:id/file?path=...` — `sandboxManager.readFile(sessionId, path)`
- `PUT /api/agency/sites/:id/file` — `sandboxManager.writeFile(sessionId, path, content)`
- `POST /api/agency/sites/:id/inline-ai` — `streamText` with Gemini Flash / Claude Haiku, SSE response

## Dependencies

- `react-resizable-panels` — drag-to-resize between preview and code editors. ~15KB, zero deps, well-maintained.

## Error Handling

- File read fails (path not found): Monaco shows empty editor with placeholder "File not found"
- Auto-save fails: Show subtle error indicator on Monaco tab, retry on next keystroke
- Inline AI fails: Show error in right panel, don't modify editor content
- HMR not triggered: Preview reloads via `iframe.src = iframe.src` after 3s as fallback (same pattern as agent edits)

## Success Criteria

- `</>` button in toolbar toggles Code Mode
- Center column splits with resizable drag handle
- Clicking a component in the tree loads its source into the Astro editor
- Typing in Monaco auto-saves after 1s and preview updates via HMR
- Inline AI chat streams CSS/HTML directly into the active editor
- All keyboard shortcuts work without macOS conflicts
- Panels are collapsible via buttons and keyboard shortcuts
