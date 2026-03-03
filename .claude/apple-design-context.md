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

| Token | Value | Tailwind |
|-------|-------|----------|
| `--radius` | `0.5rem` (8px) | `rounded` (DEFAULT) |
| `--radius-sm` | `0.375rem` (6px) | `rounded-sm` |
| `--radius-md` | `0.5rem` (8px) | `rounded-md` |
| `--radius-lg` | `0.75rem` (12px) | `rounded-lg` |
| `--radius-xl` | `1rem` (16px) | `rounded-xl` |

### Z-Index Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | `0` | Default stacking |
| `--z-raised` | `10` | Elevated cards, sticky headers |
| `--z-dropdown` | `20` | Dropdowns, popovers |
| `--z-overlay` | `40` | Overlays, backdrops |
| `--z-modal` | `50` | Modals, dialogs |

### Layout Tokens

| Token | Value |
|-------|-------|
| `--sidebar-width` | `280px` |

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

## Audit Complete

All HIG audit items resolved (Batches 1-3). Summary of LOW items:

| ID | Resolution |
|----|-----------|
| M2 | FIXED — `text-[9px]` → `text-[10px]` across 23 files |
| D4 | FIXED — 3 missing aria-labels added |
| W3 | FIXED — title tooltips added matching aria-labels (28 elements, 25 files) |
| C4 | FIXED — SettingsPage icon sizes `h-[18px] w-[18px]` → `h-4.5 w-4.5` |
| I2 | FIXED — sidebar width extracted to `--sidebar-width` CSS var |
| T2 | DEFINED — radius token scale (`--radius-sm/md/lg/xl`) + Tailwind mapping |
| T5 | DEFINED — z-index token scale (`--z-base/raised/dropdown/overlay/modal`) |
| T4 | CLOSED — 418 arbitrary font sizes across 8 values; M2 fix handles worst offender |
| M3 | CLOSED — 424 hover: classes; modern mobile browsers handle gracefully, no reported bugs |
