# VaporForge Mobile Design

## Overview

Mobile-optimized, PWA-enabled Claude Code IDE with Industrial Elegance aesthetic.

## Design Principles

### Aesthetic: Industrial Elegance
- **Inspiration**: Aerospace HUDs, Swiss typography, precision instruments
- **Colors**: Deep slate base + electric cyan accents + violet secondary
- **Typography**: Orbitron (display) + Space Mono (monospace)
- **Effects**: CRT terminal glow, glass morphism, geometric precision

### Mobile UX Patterns
- **Touch Targets**: Minimum 44px (WCAG compliant)
- **Navigation**: Bottom tab bar (thumb-reach optimized)
- **Layout**: Single view on mobile, resizable panels on desktop
- **Spacing**: 4px/8px grid system
- **Safe Areas**: iOS notch and Android navigation bar support

### Performance
- **Launch Time**: < 2 seconds
- **Animations**: 60fps with reduced motion support
- **Caching**: Offline-first service worker
- **Bundle**: Code-splitting and lazy loading

## Features

### PWA Capabilities
- ✅ Installable ("Add to Home Screen")
- ✅ Offline support (cached assets)
- ✅ Standalone mode (full-screen)
- ✅ Share target integration
- ✅ Splash screen customization

### Responsive Layout
- **Mobile (< 768px)**: Single view with bottom navigation
  - Files → Editor → Terminal → Chat
  - Smooth view transitions
  - Optimistic UI updates
- **Desktop (≥ 768px)**: Resizable panel groups
  - File tree | (Editor / Terminal) | Chat
  - Draggable separators with glow effect

### Accessibility
- WCAG 2.1 AA compliant
- Focus visible indicators
- Reduced motion support
- Screen reader optimized
- Semantic HTML

## Components

### MobileNavigation
Bottom tab bar with 4 views:
- Files (FolderTree icon)
- Editor (FileCode icon)
- Terminal (Terminal icon)
- Chat (MessageSquare icon)

Active state: cyan glow + scale effect

### Glass Cards
Backdrop blur + transparency for depth:
```css
background: hsl(var(--card-glass) / 0.6);
backdrop-filter: blur(12px) saturate(150%);
```

### Terminal Effect
CRT scan lines + radial glow:
- Animated horizontal lines (8s cycle)
- Radial gradient from center
- Text shadow for phosphor glow

### Status Indicators
Precision instrument style:
- Pulsing dot with glow
- Color-coded states (green/amber/red)
- Uppercase monospace labels

## CSS Custom Properties

### Colors
```css
--primary: 185 95% 55%;        /* Electric cyan */
--secondary: 280 80% 60%;      /* Violet */
--background: 215 25% 8%;      /* Deep slate */
--terminal-glow: 185 95% 55%;  /* CRT glow */
```

### Typography
```css
--font-display: 'Orbitron', monospace;
--font-mono: 'Space Mono', monospace;
```

### Spacing (4px/8px grid)
```css
--space-xs: 0.25rem;   /* 4px */
--space-sm: 0.5rem;    /* 8px */
--space-md: 1rem;      /* 16px */
--space-lg: 1.5rem;    /* 24px */
--space-xl: 2rem;      /* 32px */
--space-2xl: 3rem;     /* 48px */
```

### Animation
```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

## Utility Classes

### Touch-Friendly Buttons
```tsx
<button className="btn-primary">Action</button>
<button className="btn-secondary">Cancel</button>
```

### Animations
```tsx
<div className="animate-fade-up stagger-1">Content</div>
<div className="animate-scale-in">Modal</div>
```

### Loading States
```tsx
<div className="skeleton h-20 w-full"></div>
```

### Responsive Visibility
```tsx
<div className="hide-mobile">Desktop only</div>
<div className="show-mobile hide-desktop">Mobile only</div>
```

### Safe Areas (iOS/Android)
```tsx
<nav className="safe-bottom">Bottom navigation</nav>
<header className="safe-top">Top header</header>
```

## Testing

### Device Targets
- **Mobile**: iPhone 12/13/14/15, Pixel 6/7/8
- **Tablet**: iPad Pro, Samsung Tab
- **Desktop**: 1920x1080, 2560x1440

### Breakpoints
- Mobile: 320px - 767px
- Desktop: 768px+

### Performance Metrics
- Lighthouse Mobile: 90+ score
- First Contentful Paint: < 1.5s
- Time to Interactive: < 2s
- Cumulative Layout Shift: < 0.1

## Deployment

### Build
```bash
cd ui
npm run build
```

### Preview
```bash
npm run preview
```

### Deploy
```bash
cd ..
npm run deploy
```

## Future Enhancements

### Phase 4 (Future)
- [ ] Haptic feedback (vibration API)
- [ ] Swipe gestures (between views)
- [ ] Voice input for terminal
- [ ] Split-screen multitasking
- [ ] Dark/light theme toggle
- [ ] Custom color schemes
- [ ] Bluetooth keyboard shortcuts
- [ ] File upload via camera

### Advanced PWA
- [ ] Background sync
- [ ] Push notifications
- [ ] Periodic updates
- [ ] Badge API integration
- [ ] File system access API

## Resources

### Design Inspiration
- Aerospace instrumentation
- CRT monitors (1980s terminals)
- Swiss modernism (typography)
- Blade Runner UI
- Ghost in the Shell HUDs

### Fonts
- [Orbitron](https://fonts.google.com/specimen/Orbitron) - Display
- [Space Mono](https://fonts.google.com/specimen/Space+Mono) - Monospace

### Icons
- [Lucide React](https://lucide.dev/) - Icon system

## Credits

Designed with principles from:
- frontend-design (Anthropic) - Distinctive aesthetics
- ui-designer - Rapid development patterns
- mobile-ux-optimizer - Touch UX best practices
- ux-researcher - User behavior insights
- mobile-app-builder - Performance patterns
