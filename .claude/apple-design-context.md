# Apple Design Context — VaporForge HIG Audit Results

Last updated: 2026-03-03 (hig-ui-pass audit)

## Token Inventory

### Color Tokens (`:root` in `index.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `215 25% 8%` | Page background |
| `--foreground` | `180 5% 95%` | Default text |
| `--muted` | `215 20% 12%` | Muted backgrounds |
| `--muted-foreground` | `180 5% 65%` | Secondary text |
| `--primary` | `185 95% 55%` | Electric cyan — buttons, links, focus rings |
| `--secondary` | `280 80% 60%` | Violet accent |
| `--accent` | `185 95% 55%` | Highlight (same as primary) |
| `--card` | `215 22% 13%` | Card/dropdown backgrounds |
| `--border` | `215 20% 16%` | Subtle borders |
| `--ring` | `185 95% 55%` | Focus ring color |
| `--success` | `142 76% 36%` | Green |
| `--warning` | `38 92% 50%` | Amber |
| `--error` | `0 84% 60%` | Red |

Format: HSL channels (shadcn/ui pattern). Usage: `hsl(var(--token))` or `hsl(var(--token) / opacity)`.

### Spacing Tokens

| Token | Value | Tailwind |
|-------|-------|----------|
| `--space-xs` | `0.25rem` (4px) | `p-1` |
| `--space-sm` | `0.5rem` (8px) | `p-2` |
| `--space-md` | `1rem` (16px) | `p-4` |
| `--space-lg` | `1.5rem` (24px) | `p-6` |
| `--space-xl` | `2rem` (32px) | `p-8` |
| `--space-2xl` | `3rem` (48px) | `p-12` |

### Radius Tokens

| Token | Value |
|-------|-------|
| `--radius` | `0.5rem` (8px) |

### Touch & Animation Tokens

| Token | Value |
|-------|-------|
| `--touch-target` | `44px` |
| `--duration-fast` | `150ms` |
| `--duration-normal` | `250ms` |
| `--duration-slow` | `400ms` |

## Patterns Established

### Focus Ring Pattern (D1/D2)
All interactive form elements use `focus-visible:` (not `focus:`) for outline/ring/border/shadow.

**Standard input pattern:**
```
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary
```

**shadcn/ui primitive pattern:**
```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

**Exception:** Radix menu/dropdown/select items use `focus:bg-accent focus:text-accent-foreground` — these receive programmatic focus and need the `focus:` pseudo-class.

### Focus Trap Pattern (D3)
Overlays use `useFocusTrap(active, onClose)` from `@/hooks/useFocusTrap`:
- Traps Tab/Shift+Tab cycling within overlay
- Escape calls `onClose`
- Auto-focuses first focusable element on open
- Applied to: SettingsPage, CodeAnalysisPanel, CodeTransformPanel

### Touch Target Pattern
All interactive elements: `minHeight: '44px'` or `min-h-[44px]` class.
Tab bar buttons: `min-h-[44px] min-w-[44px]`.

### Color Usage Rules
- **Never use hardcoded hex/rgba** for backgrounds, borders, or text. Use `hsl(var(--token))`.
- **Exception:** SVG `fill`/`stroke` can use hex (HSL channels don't work in SVG attributes without wrapping).
- **Opacity pattern:** `hsl(var(--card) / 0.95)` — NOT `rgba()`.

### Mobile Tab Bar (HIG)
- Label font: `11px` minimum (HIG spec)
- Content height: `49px`
- Hides when keyboard opens
- Max 5 tabs
- Haptic feedback on tap

## Remaining Work (LOW priority, deferred)

| ID | Issue | Priority |
|----|-------|----------|
| M2 | `text-[9px]` instances (15+) below WCAG minimum | LOW |
| T2 | Missing radius token scale (`--radius-sm/md/lg`) | LOW |
| T4 | No font size token scale (75+ arbitrary sizes) | LOW |
| T5 | No z-index token scale | LOW |
| D4 | Sparse ARIA labels on icon-only buttons | LOW |
| W3 | Missing tooltips on icon-only buttons | LOW |
| M3 | No `@media (hover: hover)` guard | LOW |
| I2 | Tablet sidebar width not CSS-tokenized | LOW |
| C4 | Inconsistent icon sizes in settings sidebar | LOW |
