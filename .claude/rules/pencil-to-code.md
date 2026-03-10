# Pencil-to-Code: Design-to-Implementation Protocol

## MANDATORY: When implementing UI from a .pen design file

### Phase 1: Extract (DO NOT WRITE CODE YET)

1. **Read the design node** with `batch_get` at `readDepth: 3` and `resolveVariables: true`
2. **Write down every property** for each node before coding:
   - `padding` → map to CSS (e.g., `[8,12]` = `py-2 px-3` or `padding: 8px 12px`)
   - `gap` → map to CSS gap
   - `fontSize` → map to text size (e.g., `11` = `text-[11px]`)
   - `fontWeight` → map to font weight
   - `fontFamily` → map to font family
   - `letterSpacing` → map to tracking
   - `fill` → map to background-color (use exact hex, e.g., `bg-[#1c2128]`)
   - `cornerRadius` → map to border-radius
   - `stroke` → map to border (color, width, side)
   - `height` / `width` → map to dimensions
   - `justifyContent` / `alignItems` → map to flex alignment
   - `layout: "vertical"` → `flex-col`
3. **Screenshot the design frame** with `get_screenshot` for visual reference

### Phase 2: Compare Structure

4. **Read the existing code** before writing anything
5. **Compare the design's node tree structure against the existing component structure**
   - If the design has tier groups → keep tier groups in code
   - If the design has a sidebar list → keep the list structure
   - If the design removes something → confirm it's actually removed, don't assume
6. **NEVER remove structural patterns** (grouping, nesting, sections) unless the design explicitly removes them. Flattening a grouped list into a flat list is a structural change that requires explicit design evidence.

### Phase 3: Implement One Component at a Time

7. **Work on ONE component/file at a time** — do not batch-rewrite multiple files
8. **Map properties 1:1** — no "close enough", no CSS variable aliases when the design specifies exact hex values:
   - WRONG: `text-muted-foreground` when design says `fill: "#768390"`
   - RIGHT: `text-[#768390]`
   - WRONG: `bg-card` when design says `fill: "#1c2128"`
   - RIGHT: `bg-[#1c2128]`
9. **Use exact values from the design node properties**, not approximations:
   - WRONG: `rounded-md` when design says `cornerRadius: 3`
   - RIGHT: `rounded-[3px]`
   - WRONG: `px-2` when design says `padding: [8,12]`
   - RIGHT: `px-3 py-2` (12px horizontal, 8px vertical)

### Phase 4: Verify (MANDATORY after every component)

10. **Take a screenshot of the live output** via Chrome browser tools
11. **Take a screenshot of the design frame** via `get_screenshot`
12. **Compare side-by-side** — check:
    - Spacing between elements
    - Font sizes and weights
    - Colors (background, text, border)
    - Border radius and stroke
    - Layout direction and alignment
    - Active/selected states
13. **If any visual difference exists**, fix it before moving to the next component

### Anti-Patterns (NEVER DO THESE)

- NEVER "interpret" what a design should look like — read the properties
- NEVER flatten a grouped/nested structure into a flat list
- NEVER batch-rewrite 5+ files without verifying each one
- NEVER use semantic CSS classes (text-foreground, bg-card) when exact hex values are available from the design
- NEVER skip the screenshot comparison step
- NEVER say "close enough" or "mostly matches" — it either matches or it doesn't

### Padding Array Convention

Pencil padding arrays follow CSS order:
- `[all]` → all sides
- `[vertical, horizontal]` → py, px
- `[top, horizontal, bottom]` → pt, px, pb
- `[top, right, bottom, left]` → pt, pr, pb, pl
