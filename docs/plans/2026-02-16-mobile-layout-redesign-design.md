# Mobile Layout Redesign — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign VaporForge mobile layouts to follow Apple HIG — iPad gets sidebar navigation, iPhone gets HIG-compliant tab bar, Settings/Marketplace render within each layout.

**Architecture:** Separate layout shells for iPad (sidebar) and iPhone (tab bar), both sharing existing content components. Fix Layout.tsx routing so Settings/Marketplace never bypass mobile navigation.

**Tech Stack:** React 18, Tailwind v3.4, lucide-react icons, existing Zustand stores

---

## Problem Statement

1. **Layout routing bypass** — Settings/Marketplace render before the mobile check in Layout.tsx, losing the tab bar on iPad/iPhone
2. **iPad uses phone layout** — iPad gets MobileLayout (bottom tab bar), but Apple HIG says iPad should use sidebar navigation
3. **Tab bar below HIG spec** — Icons 20px (should be 25pt), wrong colors, no translucent blur background, no filled/outline distinction
4. **Header bar blends into content** — No clear navigation hierarchy, logo and session name crammed together
5. **Navigation dead-ends** — Settings/Marketplace open as full-page overlays with no tab bar or back button

## Apple HIG Reference

Source: `~/.claude/projects/-Users-jb/memory/apple-hig-reference.md`

### iPad
- "On iPad, use a split view instead of a tab bar" — Apple HIG
- iPadOS 18+: Tab bar at TOP, can convert to sidebar
- Sidebar pattern: ~320pt leading + detail fills remaining
- Safe areas: top 24pt, bottom 20pt (home indicator models)

### iPhone
- Bottom tab bar: 49pt content height + safe-area-inset-bottom
- Icons: 25x25pt, labels: 10pt Medium
- Active: system blue (#007AFF) or app accent, filled icon
- Inactive: system gray (#8E8E93), outline icon
- Background: translucent blur, 0.5px top border
- Min touch target: 44x44pt
- Navigation bar: 44pt height, back button left, title center, actions right
- Tab bar stays visible during push navigation (always)

## Architecture

```
Layout.tsx (entry point — routing fix)
├── layoutTier === 'tablet'   → TabletLayout.tsx (NEW — sidebar)
├── layoutTier === 'phone'    → MobileLayout.tsx (OVERHAULED — HIG tab bar)
└── layoutTier === 'desktop'  → existing PanelGroup (unchanged)
    ├── marketplaceOpen → MarketplacePage (desktop only)
    └── settingsOpen → SettingsPage (desktop only)
```

## iPad — TabletLayout.tsx (Sidebar Pattern)

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ safe-area-header (24pt top inset)                   │
├────────────┬────────────────────────────────────────┤
│ Sidebar    │ Content Area                           │
│ (280px)    │                                        │
│            │ Renders: Chat / Files / Terminal /      │
│ Logo       │ Settings / Marketplace / WelcomeScreen  │
│ ─────      │                                        │
│ Chat       │                                        │
│ Files      │                                        │
│ Terminal   │                                        │
│ ─────      │                                        │
│ Plugins    │                                        │
│ Settings   │                                        │
│ ─────      │                                        │
│ Sessions   │                                        │
│  > Sess 1  │                                        │
│  > Sess 2  │                                        │
│ ─────      │                                        │
│ Sign Out   │                                        │
├────────────┴────────────────────────────────────────┤
│ safe-area-bottom (20pt)                             │
└─────────────────────────────────────────────────────┘
```

### Sidebar Sections
1. **Branding**: VaporForge logo (inline SVG) + text
2. **Session nav** (visible when session active): Chat, Files, Terminal
3. **Tools**: Plugins, Bug Tracker, Dev Playground
4. **Settings**: Opens in content area (sidebar stays visible)
5. **Sessions list**: Scrollable, status dots, click to switch
6. **Sign Out**: Bottom-anchored

### Sidebar Styling
- Background: `bg-card/95 backdrop-blur-md`
- Width: 280px
- Border-right: `0.5px solid` border color
- Nav items: 44pt min touch, 13pt Medium side-by-side icon+label (HIG regular width)
- Active: accent bg, filled icon
- Inactive: muted foreground, outline icon

### Content Area
- Fills remaining width
- Renders selected view component
- Has its own scrolling context
- safe-area-bottom padding

## iPhone — MobileLayout.tsx (HIG Tab Bar)

### Layout Structure

```
┌─────────────────────────────────┐
│ safe-area-header                │
├─────────────────────────────────┤
│ Navigation Bar (44pt)           │
│ [Back?]  Title    [Action?]     │
├─────────────────────────────────┤
│                                 │
│ Content Area                    │
│ (fills remaining)               │
│                                 │
├─────────────────────────────────┤
│ Tab Bar (49pt icons+labels)     │
│ Home  Chat  Files  Term  More   │
├─────────────────────────────────┤
│ safe-area-bottom (34pt)         │
└─────────────────────────────────┘
```

### Tab Bar Spec (HIG-compliant)
- Height: 49pt content + env(safe-area-inset-bottom)
- Icons: 25x25pt (up from 20px)
- Labels: 10px Medium (keep current)
- Active: VaporForge primary (#1dd3e6) — keeping brand color
- Inactive: `#8E8E93` (system gray)
- Background: `rgba(30, 30, 30, 0.94)` + `backdrop-filter: blur(20px)`
- Top border: `0.5px solid rgba(255, 255, 255, 0.15)`
- Touch target: 44x44pt minimum per item
- Keyboard: `translate-y-full` when keyboard open (keep current behavior)

### Navigation Bar (NEW — MobileNavBar.tsx)
- Height: 44pt
- Background: same translucent blur as tab bar
- Left: Back button (chevron-left, when sub-navigating) or logo (at root)
- Center: Title text — page name or session name
- Right: Contextual actions (e.g., session status dot)
- Bottom border: 1px solid border

### Sub-Navigation
When user taps "More" → Settings, the content changes but tab bar stays:
- More tab renders MoreMenu (list of links)
- Tapping "Settings" pushes SettingsPage into content area
- Nav bar shows back button + "Settings" title
- Tab bar remains with "More" active
- Back button returns to MoreMenu

Same pattern for Marketplace, Bug Tracker, Dev Playground.

State tracked in `useMobileNav` with a `subView` field:
```typescript
type SubView = null | 'settings' | 'marketplace' | 'issues' | 'playground';
```

## Routing Fix — Layout.tsx

```tsx
// NEW order (tablet/phone BEFORE settings/marketplace):
if (layoutTier === 'tablet') {
  return (
    <>
      <TabletLayout />
      <QuickChatPanel />
      {/* overlays render on top */}
    </>
  );
}
if (layoutTier === 'phone') {
  return (
    <>
      <MobileLayout />
      <QuickChatPanel />
      {/* overlays render on top */}
    </>
  );
}

// Desktop keeps current behavior:
if (marketplaceOpen) return <MarketplacePage />;
if (settingsOpen) return <SettingsPage />;
// ... rest of desktop layout
```

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `ui/src/components/TabletLayout.tsx` | iPad sidebar layout (~200 lines) |
| CREATE | `ui/src/components/mobile/MobileNavBar.tsx` | HIG nav bar with back/title/actions (~80 lines) |
| MODIFY | `ui/src/components/MobileLayout.tsx` | Full overhaul — nav bar, sub-navigation, Settings/Marketplace within |
| MODIFY | `ui/src/components/mobile/MobileTabBar.tsx` | HIG icon sizes (25pt), colors, blur bg, border |
| MODIFY | `ui/src/components/Layout.tsx` | Move tablet/phone checks before settings/marketplace |
| MODIFY | `ui/src/hooks/useMobileNav.ts` | Add subView state for sub-navigation within tabs |
| MODIFY | `ui/src/index.css` | Sidebar styles, updated safe area utilities |

## Components NOT Modified

These render identically in both layouts:
- ChatPanel, FileTree, XTerminal, Editor
- SettingsPage, MarketplacePage (already mobile-aware)
- WelcomeScreen, SessionBootScreen
- QuickChatPanel, IssueTracker, DebugPanel (overlays)

## Decision Log

| Decision | Reasoning |
|----------|-----------|
| Separate TabletLayout vs MobileLayout | Apple HIG says iPad and iPhone have fundamentally different navigation paradigms |
| Keep VaporForge primary (#1dd3e6) for active tab | Brand consistency > system blue; user can change via Appearance settings |
| 280px sidebar (not 320pt) | VaporForge has less nav content than typical iPad app; 280px leaves more content space |
| Sub-navigation via state (not router) | No React Router in project; keep Zustand store pattern |
| MoreMenu becomes navigation hub | Consolidates Settings/Marketplace/Tools access with proper back navigation |
| Overlays (QuickChat, IssueTracker) render outside layouts | They're floating panels that should work on any layout |
