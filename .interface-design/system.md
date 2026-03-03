# VaporForge Design System

## Intent

**Who:** Developers who use Claude Code daily — accessing it from any device (phone, tablet, laptop) via their existing Anthropic Pro/Max subscription. They're technical, impatient, often debugging at odd hours.

**What they do:** Write code, read AI responses, manage sessions, configure MCP servers and plugins, run commands in a terminal — all through a browser-based IDE.

**Feel:** Terminal-native with polish. Cold like a terminal, warm like a well-configured dev environment. Dense information, quiet chrome, cyan accents that glow like a CRT. Not a corporate dashboard — a personal tool that feels fast and precise.

## Direction

- **Domain:** IDE, terminal, code editor, command line, container orchestration
- **Signature:** Cyan CRT glow — scrollbar hover, panel separators, focus rings, button shadows all pulse with `--primary` cyan
- **Depth strategy:** Borders-only (dense tool aesthetic), with selective glass-morphism for floating panels
- **Temperature:** Cool/cold — slate backgrounds, desaturated surfaces, cyan and violet as the only saturated colors

## Palette

### Primitives (HSL channels — compose with `hsl(var(--token) / opacity)`)

| Token | Dark | Light | Role |
|-------|------|-------|------|
| `--background` | 215 25% 8% | 0 0% 98% | Page canvas |
| `--foreground` | 180 5% 95% | 215 25% 15% | Primary text |
| `--muted` | 215 20% 12% | 210 15% 93% | Recessed surfaces |
| `--muted-foreground` | 180 5% 65% | 215 15% 45% | Secondary text |
| `--card` | 215 22% 13% | 0 0% 100% | Elevated surfaces |
| `--card-foreground` | 180 5% 95% | 215 25% 15% | Card text |
| `--border` | 215 20% 16% | 210 15% 85% | Separation |
| `--primary` | 185 95% 55% | 185 85% 40% | Cyan accent |
| `--secondary` | 280 80% 60% | 280 60% 50% | Violet accent |
| `--ring` | 185 95% 55% | 185 85% 40% | Focus indicator |

### Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--success` | 142 76% 36% | Green — both modes |
| `--warning` | 38 92% 50% | Amber — both modes |
| `--error` | 0 84% 60% | Red — both modes |
| `--terminal-glow` | = primary | CRT glow effect |
| `--card-glass` | = muted (dark) / white (light) | Glass-morphism base |

### Color rules
- Never hardcode hex/rgba for backgrounds, borders, or text
- Use `hsl(var(--token))` or `hsl(var(--token) / opacity)` pattern
- SVG fill/stroke may use hex
- Two accent colors only: cyan (primary) and violet (secondary)

## Typography

| Family | Token | Stack | Usage |
|--------|-------|-------|-------|
| System | `--font-system` | -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif | Body text, UI chrome |
| Display | `--font-display` | 'Orbitron', monospace | Headings, buttons (.btn-touch) |
| Mono | `--font-mono` | 'Space Mono', monospace | Code, terminal, pre blocks |

Tailwind: `font-system`, `font-display`, `font-mono`

### Prose
All `@tailwindcss/typography` tokens map to design system variables — links use `--primary`, borders use `--border`, code uses `--primary`.

## Spacing

4px base, 8px grid.

| Token | Value | Tailwind |
|-------|-------|----------|
| `--space-xs` | 0.25rem (4px) | `p-xs`, `gap-xs` |
| `--space-sm` | 0.5rem (8px) | `p-sm`, `gap-sm` |
| `--space-md` | 1rem (16px) | `p-md`, `gap-md` |
| `--space-lg` | 1.5rem (24px) | `p-lg`, `gap-lg` |
| `--space-xl` | 2rem (32px) | `p-xl`, `gap-xl` |
| `--space-2xl` | 3rem (48px) | `p-2xl`, `gap-2xl` |

## Border Radius

Sharper = more technical. VF leans technical.

| Token | Value | Tailwind |
|-------|-------|----------|
| `--radius-sm` | 0.375rem (6px) | `rounded-sm` |
| `--radius` / `--radius-md` | 0.5rem (8px) | `rounded` / `rounded-md` |
| `--radius-lg` | 0.75rem (12px) | `rounded-lg` |
| `--radius-xl` | 1rem (16px) | `rounded-xl` |

## Z-Index

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | 0 | Default stacking |
| `--z-raised` | 10 | Sticky headers, elevated cards |
| `--z-dropdown` | 20 | Dropdowns, popovers |
| `--z-overlay` | 40 | Backdrops |
| `--z-modal` | 50 | Modals, dialogs |

Tailwind utilities `z-10`/`z-20`/`z-40`/`z-50` align with these.

## Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--sidebar-width` | 280px | Tablet sidebar |
| `--touch-target` | 44px | iOS HIG minimum tap target |

Tailwind: `min-h-touch`, `min-w-touch`

## Animation

### Timing

| Token | Value | Tailwind |
|-------|-------|----------|
| `--duration-fast` | 150ms | `duration-fast` |
| `--duration-normal` | 250ms | `duration-normal` |
| `--duration-slow` | 400ms | `duration-slow` |

### Easing

| Token | Value | Tailwind |
|-------|-------|----------|
| `--ease-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | `ease-smooth` |
| `--ease-bounce` | cubic-bezier(0.68, -0.55, 0.265, 1.55) | `ease-bounce` |

### Named animations
- `shimmer` — skeleton loading (4s infinite)
- `scale-in` — mount entrance (0.2s)
- `slide-in-right` — panel slide (0.3s)
- `collapsible-down/up` — Radix Collapsible expand/collapse (0.2s)
- Agency-mode has its own animation set (scan, float, ring-spin, breathe, etc.)

## Depth Strategy

**Primary: Borders-only.** Subtle `hsl(var(--border))` separation. No drop shadows on cards.

**Exception: Glass-morphism** for floating panels:
```css
background: hsl(var(--card-glass) / 0.6);
backdrop-filter: blur(12px) saturate(150%);
border: 1px solid hsl(var(--border));
```

**Exception: CRT glow** on primary buttons and active separators:
```css
box-shadow: 0 0 20px hsl(var(--primary) / 0.4);
```

## Component Patterns

### Focus
- Form inputs: `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary`
- shadcn primitives: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Radix dropdown items: `focus:bg-accent focus:text-accent-foreground`
- All overlays use `useFocusTrap(active, onClose)` hook

### Touch targets
- All interactive elements: min 44px height/width
- Buttons: `min-h-touch` or `style={{ minHeight: 'var(--touch-target)' }}`

### Scrollbars
- 8px width, `--muted` track, `--primary/0.3` thumb
- Hover: `--primary/0.6` with cyan glow

### Mobile
- Tab bar: 49px content height, 11px label minimum, max 5 tabs
- Safe areas: `env(safe-area-inset-*)` for notch/home indicator
- `100dvh` viewport, `overflow: hidden` on html/body
- `overscroll-behavior: none` for native feel
- `prefers-reduced-motion` kills all animations

### Right-side controls
All close/exit buttons go RIGHT. Title/info goes LEFT. Pattern: `justify-between`.
