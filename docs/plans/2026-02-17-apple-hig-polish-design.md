# Apple HIG Mobile Polish Pass — Design Doc

**Goal:** Bring every interactive element in VaporForge's mobile/tablet UI to full Apple Human Interface Guidelines compliance.

**Architecture:** CSS-only surgical fixes across 4 files. No structural or behavioral changes.

**Version:** v0.23.1

---

## Apple HIG Reference Specs

| Element | Apple HIG Spec |
|---------|---------------|
| Minimum touch target | 44x44pt |
| Tab bar height (iPhone) | 49pt (plus safe area) |
| Tab bar height (iPad) | 50pt (plus safe area) |
| Navigation bar height | 44pt |
| Tab bar icon size | ~25pt |
| Tab bar label (iPhone) | 10pt |
| List row minimum height | 44pt |
| Caption 2 (smallest text) | 11pt, line-height 13 |
| Caption 1 | 12pt, line-height 16 |
| Footnote | 13pt, line-height 18 |
| Subheadline | 15pt, line-height 20 |
| Body / Headline | 17pt, line-height 22 |

---

## Audit Results

### Already Compliant (no changes)
- MobileTabBar.tsx — 49pt, 44pt targets, 25px icons, 10px labels
- MobileLayout.tsx — correct dvh/viewport logic
- ChatPanel.tsx — prompt input meets 44pt
- IssueTracker.tsx — excellent responsive layout

### Violations Found: 14

---

## Fix Plan

### SettingsPage.tsx (5 fixes)

1. **Mobile tab strip touch targets**: Add `min-h-[44px]` and bump text from `text-xs` to `text-[13px]`
2. **Mobile tab icons**: Change `h-4 w-4` (16px) to `h-[18px] w-[18px]` in TAB_GROUPS definitions
3. **Close button mobile**: Change `h-9 w-9 sm:h-11 sm:w-11` to `h-11 w-11` (44px always)
4. **Desktop sidebar section labels**: `text-[10px]` to `text-[11px]`
5. **Hide redundant Settings header on mobile**: MobileNavBar already shows "Settings" title

### TabletLayout.tsx (4 fixes)

1. **New Session button**: `minHeight: '36px'` to `'44px'`
2. **Session list items**: `minHeight: '36px'` to `'44px'`
3. **Content header bar**: `height: '36px'` to `minHeight: '44px'`
4. **SidebarSectionLabel**: `text-[10px]` to `text-[11px]`

### MoreMenu.tsx (4 fixes)

1. **MenuItem**: Add `min-h-[44px]` class
2. **Session list buttons**: Add `min-h-[44px]` class
3. **SectionHeader**: `text-[10px]` to `text-[11px]`
4. **Active badge**: `text-[10px]` to `text-[11px]`

### MobileNavBar.tsx (1 fix)

1. **Title font**: `text-sm` (14px) to `fontSize: '15px'` (Subheadline)

---

## Implementation Tasks

1. Fix SettingsPage.tsx (all 5 issues)
2. Fix TabletLayout.tsx (all 4 issues)
3. Fix MoreMenu.tsx (all 4 issues)
4. Fix MobileNavBar.tsx (1 issue)
5. Build, deploy, verify on device
6. Commit and push
