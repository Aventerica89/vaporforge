# Mobile Layout Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign VaporForge mobile layouts to follow Apple HIG — iPad gets sidebar navigation, iPhone gets HIG-compliant tab bar, Settings/Marketplace render within each layout instead of bypassing mobile navigation.

**Architecture:** Two separate layout shells (TabletLayout for iPad sidebar, overhauled MobileLayout for iPhone tab bar) sharing existing content components. Fix Layout.tsx routing so mobile checks happen before settings/marketplace.

**Tech Stack:** React 18, Tailwind v3.4, lucide-react icons, Zustand stores, existing hooks (useKeyboard, useDeviceInfo, useMobileNav)

---

### Task 1: Fix Layout.tsx Routing Order

**Files:**
- Modify: `ui/src/components/Layout.tsx`

**Why:** Settings and Marketplace currently render before the mobile check (lines 220-258), causing iPad/iPhone to lose the tab bar when opening Settings or Marketplace. This is the root cause of navigation dead-ends on mobile.

**Step 1: Move mobile checks before settings/marketplace**

In `Layout.tsx`, replace the three conditional blocks at lines 219-258 (marketplaceOpen, settingsOpen, isMobile) with the new routing order:

```tsx
// Mobile gets its own layout — check BEFORE settings/marketplace
// (settings and marketplace render WITHIN mobile layouts, not as separate pages)
if (isMobile) {
  return (
    <>
      <MobileLayout />
      <QuickChatPanel />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
      <DebugPanel />
    </>
  );
}

// Desktop-only: Full-page marketplace view
if (marketplaceOpen) {
  return (
    <>
      <MarketplacePage />
      <QuickChatPanel />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
      <DebugPanel />
    </>
  );
}

// Desktop-only: Full-page settings view
if (settingsOpen) {
  return (
    <>
      <SettingsPage />
      <QuickChatPanel />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
      <DebugPanel />
    </>
  );
}
```

**Note:** We keep the single `isMobile` check for now (covers both phone and tablet). TabletLayout will be introduced in Task 6 by splitting this into `layoutTier === 'tablet'` and `layoutTier === 'phone'` checks.

**Step 2: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds. Mobile users will now stay in MobileLayout when opening Settings (though Settings won't render yet within mobile — that comes in Task 5).

**Step 3: Commit**

```bash
git add ui/src/components/Layout.tsx
git commit -m "fix: route mobile layouts before settings/marketplace in Layout.tsx"
```

---

### Task 2: Add Sub-Navigation State to useMobileNav

**Files:**
- Modify: `ui/src/hooks/useMobileNav.ts`

**Why:** When a user taps Settings or Marketplace from the More menu, we need state to track that we're viewing a sub-page within the More tab. This lets the nav bar show a back button and the correct title, while the tab bar keeps "More" highlighted.

**Step 1: Add SubView type and state**

Replace the entire `useMobileNav.ts` with:

```typescript
import { useCallback, useRef, useState } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';

const TAB_ORDER: readonly MobileTab[] = ['home', 'chat', 'files', 'terminal', 'more'];

export type SwipeDirection = 'left' | 'right' | null;

export type SubView = null | 'settings' | 'marketplace' | 'issues' | 'playground';

const SUB_VIEW_TITLES: Record<Exclude<SubView, null>, string> = {
  settings: 'Settings',
  marketplace: 'Plugins',
  issues: 'Bug Tracker',
  playground: 'Dev Playground',
};

export function getSubViewTitle(subView: SubView): string | null {
  return subView ? SUB_VIEW_TITLES[subView] : null;
}

export function useMobileNav() {
  const [activeTab, setActiveTabState] = useState<MobileTab>('chat');
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [subView, setSubViewState] = useState<SubView>(null);
  const prevIndexRef = useRef(TAB_ORDER.indexOf('chat'));

  const setActiveTab = useCallback((tab: MobileTab) => {
    const newIndex = TAB_ORDER.indexOf(tab);
    const prevIndex = prevIndexRef.current;

    // Same tab selected — no-op
    if (newIndex === prevIndex) return;

    setSwipeDirection(newIndex > prevIndex ? 'left' : 'right');
    prevIndexRef.current = newIndex >= 0 ? newIndex : 0;
    setActiveTabState(tab);
    // Clear sub-view when switching tabs
    setSubViewState(null);
  }, []);

  const setSubView = useCallback((view: SubView) => {
    setSubViewState(view);
  }, []);

  const goBack = useCallback(() => {
    setSubViewState(null);
  }, []);

  const onSessionChange = useCallback(() => {
    setActiveTabState('chat');
    prevIndexRef.current = TAB_ORDER.indexOf('chat');
    setSwipeDirection(null);
    setSubViewState(null);
  }, []);

  return {
    activeTab,
    setActiveTab,
    swipeDirection,
    subView,
    setSubView,
    goBack,
    onSessionChange,
  };
}
```

**Step 2: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds. No visual changes yet — consumers don't use `subView` yet.

**Step 3: Commit**

```bash
git add ui/src/hooks/useMobileNav.ts
git commit -m "feat: add sub-navigation state (subView) to useMobileNav"
```

---

### Task 3: Upgrade MobileTabBar to Apple HIG Spec

**Files:**
- Modify: `ui/src/components/mobile/MobileTabBar.tsx`

**Why:** Current tab bar has 20px icons (HIG says 25pt), wrong active/inactive colors, and missing translucent blur background. This task brings it to HIG compliance.

**Step 1: Update tab bar styling and icon sizes**

Replace the entire `MobileTabBar.tsx` with:

```tsx
import { memo } from 'react';
import {
  MessageSquare,
  FolderTree,
  Terminal,
  MoreHorizontal,
  Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { haptics } from '@/lib/haptics';

export type MobileTab = 'chat' | 'files' | 'terminal' | 'more' | 'home';

interface TabDefinition {
  readonly id: MobileTab;
  readonly label: string;
  readonly icon: LucideIcon;
}

const SESSION_TABS: readonly TabDefinition[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'more', label: 'More', icon: MoreHorizontal },
] as const;

const NO_SESSION_TABS: readonly TabDefinition[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'more', label: 'More', icon: MoreHorizontal },
] as const;

/** HIG colors */
const ACTIVE_COLOR = '#1dd3e6';
const INACTIVE_COLOR = '#8E8E93';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasSession: boolean;
  readonly keyboardOpen: boolean;
}

export const MobileTabBar = memo(function MobileTabBar({
  activeTab,
  onTabChange,
  hasSession,
  keyboardOpen,
}: MobileTabBarProps) {
  const tabs = hasSession ? SESSION_TABS : NO_SESSION_TABS;

  const handleTabPress = (tab: MobileTab) => {
    haptics.light();
    onTabChange(tab);
  };

  return (
    <nav
      role="tablist"
      className={[
        'flex flex-col',
        'transition-transform duration-200',
        keyboardOpen ? 'translate-y-full' : '',
      ].filter(Boolean).join(' ')}
      style={{
        background: 'rgba(30, 30, 30, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid rgba(255, 255, 255, 0.15)',
      }}
    >
      {/* Button row — 49pt content height (HIG spec) */}
      <div
        className="flex items-center justify-around"
        style={{ height: '49px', paddingTop: '6px' }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              className="flex flex-1 flex-col items-center justify-center gap-0.5"
              style={{
                minHeight: '44px',
                minWidth: '44px',
                color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                WebkitTapHighlightColor: 'transparent',
              }}
              onClick={() => handleTabPress(tab.id)}
            >
              <Icon
                size={25}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className="font-medium"
                style={{ fontSize: '10px' }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer — background extends behind home indicator */}
      <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  );
});
```

**Key changes from current:**
- Icons: `size={20}` -> `size={25}` (HIG 25pt)
- Active color: `text-primary` class -> inline `#1dd3e6` (brand primary)
- Inactive color: `text-muted-foreground` -> `#8E8E93` (HIG system gray)
- Background: `bg-card/95 backdrop-blur-md` classes -> inline `rgba(30,30,30,0.94)` + `blur(20px)`
- Border: `border-t border-border` -> inline `0.5px solid rgba(255,255,255,0.15)`
- Touch targets: explicit `minHeight: 44px`, `minWidth: 44px`
- Tap highlight: `-webkit-tap-highlight-color: transparent`

**Step 2: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds. Tab bar should now have proper HIG styling.

**Step 3: Commit**

```bash
git add ui/src/components/mobile/MobileTabBar.tsx
git commit -m "feat: upgrade MobileTabBar to Apple HIG spec (25pt icons, system colors, blur bg)"
```

---

### Task 4: Create MobileNavBar Component

**Files:**
- Create: `ui/src/components/mobile/MobileNavBar.tsx`

**Why:** iPhone needs a proper navigation bar (44pt height, translucent blur, back button when sub-navigating, centered title). Currently the header bar is a centered flex with logo + session name — no hierarchy or back navigation.

**Step 1: Create the nav bar component**

Create `ui/src/components/mobile/MobileNavBar.tsx`:

```tsx
import { memo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptics } from '@/lib/haptics';

interface MobileNavBarProps {
  /** Page title to display center */
  readonly title: string;
  /** Whether to show back button (sub-navigation active) */
  readonly showBack: boolean;
  /** Called when back button tapped */
  readonly onBack?: () => void;
  /** Status dot color class (e.g. 'bg-green-500') or null */
  readonly statusDot?: string | null;
  /** Right-side action node (optional) */
  readonly rightAction?: React.ReactNode;
}

export const MobileNavBar = memo(function MobileNavBar({
  title,
  showBack,
  onBack,
  statusDot,
  rightAction,
}: MobileNavBarProps) {
  return (
    <div
      className="shrink-0 safe-area-header"
      style={{
        background: 'rgba(30, 30, 30, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div
        className="flex items-center px-4"
        style={{ height: '44px' }}
      >
        {/* Left: back button or logo */}
        <div className="flex w-16 items-center">
          {showBack ? (
            <button
              onClick={() => {
                haptics.light();
                onBack?.();
              }}
              className="flex items-center gap-0.5 -ml-2 px-2 py-1"
              style={{
                color: '#1dd3e6',
                minHeight: '44px',
                minWidth: '44px',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Go back"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
              <span className="text-sm font-medium">Back</span>
            </button>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 512 512"
              className="shrink-0"
            >
              <rect width="512" height="512" rx="96" fill="#0f1419" />
              <path
                d="M222 230 L162 296 L222 362"
                stroke="#1dd3e6"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M290 230 L350 296 L290 362"
                stroke="#E945F5"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          )}
        </div>

        {/* Center: title */}
        <div className="flex flex-1 items-center justify-center gap-2 min-w-0">
          {statusDot && (
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {title}
          </span>
        </div>

        {/* Right: contextual action or spacer */}
        <div className="flex w-16 items-center justify-end">
          {rightAction ?? null}
        </div>
      </div>
    </div>
  );
});
```

**Step 2: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds. Component not used yet — no visual change.

**Step 3: Commit**

```bash
git add ui/src/components/mobile/MobileNavBar.tsx
git commit -m "feat: create MobileNavBar (HIG 44pt nav bar with back/title/actions)"
```

---

### Task 5: Overhaul MobileLayout with Nav Bar and Sub-Navigation

**Files:**
- Modify: `ui/src/components/MobileLayout.tsx`
- Modify: `ui/src/components/mobile/MoreMenu.tsx`

**Why:** MobileLayout needs to integrate the new nav bar, render Settings/Marketplace within itself (instead of escaping to Layout.tsx), and wire up the sub-navigation state from Task 2.

**Step 1: Update MoreMenu to use sub-navigation instead of store toggles**

The current MoreMenu calls `openSettings()` and `openMarketplace()` which set Zustand flags that Layout.tsx reads — bypassing MobileLayout. Instead, it needs to call `setSubView()`.

Replace `ui/src/components/mobile/MoreMenu.tsx` with:

```tsx
import {
  Plus,
  GitBranch,
  Settings,
  Puzzle,
  Bug,
  Hammer,
  LogOut,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useAuthStore } from '@/hooks/useAuth';
import { haptics } from '@/lib/haptics';
import type { SubView } from '@/hooks/useMobileNav';

interface MoreMenuProps {
  readonly onOpenCloneModal: () => void;
  readonly onSelectSession: (id: string) => void;
  readonly onNavigate: (view: SubView) => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: 'danger';
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10'
      : 'hover:bg-accent';

  return (
    <button
      onClick={() => {
        haptics.light();
        onClick();
      }}
      className={[
        'flex w-full items-center gap-3 rounded-xl px-4 py-3.5',
        'text-sm font-medium transition-colors active:scale-[0.98]',
        colorClass,
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionHeader({ children }: { readonly children: string }) {
  return (
    <h4 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </h4>
  );
}

export function MoreMenu({
  onOpenCloneModal,
  onSelectSession,
  onNavigate,
}: MoreMenuProps) {
  const sessions = useSandboxStore((s) => s.sessions);
  const currentSession = useSandboxStore((s) => s.currentSession);
  const createSession = useSandboxStore((s) => s.createSession);
  const logout = useAuthStore((s) => s.logout);

  const handleNewSession = async () => {
    haptics.light();
    await createSession();
  };

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Actions */}
      <div className="p-3 space-y-0.5">
        <SectionHeader>Actions</SectionHeader>
        <MenuItem
          icon={<Plus className="h-4.5 w-4.5 text-primary" />}
          label="New Session"
          onClick={handleNewSession}
        />
        <MenuItem
          icon={<GitBranch className="h-4.5 w-4.5 text-secondary" />}
          label="Clone Repo"
          onClick={onOpenCloneModal}
        />
      </div>

      {/* Sessions */}
      {sessions.length > 0 && (
        <div className="p-3 space-y-0.5">
          <SectionHeader>Sessions</SectionHeader>
          {sessions.slice(0, 10).map((session) => {
            const isActive = currentSession?.id === session.id;
            const name =
              (session.metadata as { name?: string })?.name ||
              session.id.slice(0, 8);
            const dotColor =
              session.status === 'active'
                ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
                : session.status === 'sleeping'
                  ? 'bg-yellow-500'
                  : 'bg-gray-500';

            return (
              <button
                key={session.id}
                onClick={() => {
                  haptics.light();
                  onSelectSession(session.id);
                }}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm',
                  'transition-colors active:scale-[0.98]',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 shrink-0 rounded-full',
                    dotColor,
                  ].join(' ')}
                />
                <span className="truncate">{name}</span>
                {isActive && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-primary/60">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tools */}
      <div className="p-3 space-y-0.5">
        <SectionHeader>Tools</SectionHeader>
        <MenuItem
          icon={<Bug className="h-4.5 w-4.5 text-orange-500" />}
          label="Bug Tracker"
          onClick={() => onNavigate('issues')}
        />
        <MenuItem
          icon={<Hammer className="h-4.5 w-4.5 text-amber-500" />}
          label="Dev Playground"
          onClick={() => onNavigate('playground')}
        />
        <MenuItem
          icon={<Puzzle className="h-4.5 w-4.5 text-primary" />}
          label="Plugins"
          onClick={() => onNavigate('marketplace')}
        />
        <MenuItem
          icon={<Settings className="h-4.5 w-4.5 text-muted-foreground" />}
          label="Settings"
          onClick={() => onNavigate('settings')}
        />
      </div>

      {/* Sign Out */}
      <div className="p-3 mt-auto">
        <MenuItem
          icon={<LogOut className="h-4.5 w-4.5" />}
          label="Sign Out"
          onClick={() => logout()}
          variant="danger"
        />
      </div>
    </div>
  );
}
```

**Key changes:**
- Removed imports for `useSettingsStore`, `useMarketplace`, `useIssueTracker`, `usePlayground`
- Added `onNavigate` prop (calls `setSubView()` from parent)
- Tools section now calls `onNavigate('settings')` etc. instead of `openSettings()`

**Step 2: Overhaul MobileLayout.tsx**

Replace `ui/src/components/MobileLayout.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useMobileNav, getSubViewTitle } from '@/hooks/useMobileNav';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MobileNavBar } from './mobile/MobileNavBar';
import { MoreMenu } from './mobile/MoreMenu';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';
import { MarketplacePage } from './marketplace';

export function MobileLayout() {
  const { currentSession, isCreatingSession, selectSession, deselectSession } =
    useSandboxStore();
  useAutoReconnect();
  const { isVisible: keyboardOpen, viewportHeight } = useKeyboard();
  const {
    activeTab,
    setActiveTab,
    subView,
    setSubView,
    goBack,
    onSessionChange,
  } = useMobileNav();
  const hasSession = !!currentSession;
  const swipeHandlers = useSwipeTabs({
    activeTab,
    onTabChange: setActiveTab,
    hasSession,
  });
  const [showCloneModal, setShowCloneModal] = useState(false);
  const containerHeight = `${viewportHeight}px`;

  const sessionId = currentSession?.id;
  useEffect(() => {
    onSessionChange();
  }, [sessionId, onSessionChange]);

  const sessionName = currentSession
    ? (currentSession.metadata as { name?: string })?.name ||
      currentSession.id.slice(0, 8).toUpperCase()
    : 'VAPORFORGE';

  const statusColor = currentSession
    ? currentSession.status === 'active'
      ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
      : currentSession.status === 'sleeping'
        ? 'bg-yellow-500'
        : 'bg-gray-500'
    : null;

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleTabChange = (
    tab: import('./mobile/MobileTabBar').MobileTab,
  ) => {
    if (tab === 'home' && hasSession) {
      deselectSession();
    }
    setActiveTab(tab);
  };

  // Determine nav bar title
  const subViewTitle = getSubViewTitle(subView);
  const navTitle = subViewTitle ?? sessionName;
  const showBack = subView !== null;

  const renderTabContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;

    // Sub-views render within the More tab
    if (subView) {
      switch (subView) {
        case 'settings':
          return <SettingsPage />;
        case 'marketplace':
          return <MarketplacePage />;
        case 'issues':
        case 'playground':
          // These continue as floating overlays for now
          goBack();
          return null;
        default:
          return null;
      }
    }

    if (!hasSession) {
      if (activeTab === 'more') {
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
            onNavigate={setSubView}
          />
        );
      }
      return <WelcomeScreen />;
    }

    switch (activeTab) {
      case 'home':
        return <WelcomeScreen />;
      case 'chat':
        return <ChatPanel />;
      case 'files':
        return (
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        );
      case 'terminal':
        return <XTerminal compact />;
      case 'more':
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
            onNavigate={setSubView}
          />
        );
      default:
        return <ChatPanel />;
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: containerHeight }}
    >
      {/* HIG Navigation Bar */}
      <MobileNavBar
        title={navTitle}
        showBack={showBack}
        onBack={goBack}
        statusDot={!showBack ? statusColor : null}
      />

      {/* Tab content */}
      <div
        className="flex flex-1 flex-col min-h-0 overflow-hidden"
        {...(subView ? {} : swipeHandlers)}
      >
        {renderTabContent()}
      </div>

      {/* HIG Tab bar */}
      <MobileTabBar
        activeTab={
          hasSession
            ? activeTab
            : activeTab === 'more'
              ? 'more'
              : 'home'
        }
        onTabChange={handleTabChange}
        hasSession={hasSession}
        keyboardOpen={keyboardOpen}
      />

      {/* Clone repo modal */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}
```

**Key changes from current MobileLayout:**
- Replaced inline header bar with `<MobileNavBar>`
- Added sub-view rendering: when `subView` is set, renders Settings/Marketplace within tab content
- MoreMenu gets `onNavigate` prop instead of calling external store toggles
- Swipe gestures disabled during sub-view (prevents accidental tab switch)
- Status dot only shown when not sub-navigating
- Issues and Playground still use floating overlays (trigger via their hooks then goBack)

**Step 3: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add ui/src/components/MobileLayout.tsx ui/src/components/mobile/MoreMenu.tsx
git commit -m "feat: overhaul MobileLayout with HIG nav bar and sub-navigation"
```

---

### Task 6: Create TabletLayout (iPad Sidebar)

**Files:**
- Create: `ui/src/components/TabletLayout.tsx`
- Modify: `ui/src/components/Layout.tsx` (split mobile check into tablet/phone)

**Why:** Apple HIG says iPad should use a sidebar, not a bottom tab bar. This creates a dedicated iPad layout with a 280px sidebar for navigation and the content area filling the remaining width.

**Step 1: Create TabletLayout.tsx**

Create `ui/src/components/TabletLayout.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  FolderTree,
  Terminal,
  Settings,
  Puzzle,
  Bug,
  Hammer,
  LogOut,
  Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';
import { SettingsPage } from './SettingsPage';
import { MarketplacePage } from './marketplace';
import { useAuthStore } from '@/hooks/useAuth';
import { haptics } from '@/lib/haptics';

type SidebarView =
  | 'home'
  | 'chat'
  | 'files'
  | 'terminal'
  | 'settings'
  | 'marketplace'
  | 'issues'
  | 'playground';

interface NavItem {
  readonly id: SidebarView;
  readonly label: string;
  readonly icon: LucideIcon;
}

const SESSION_NAV: readonly NavItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

const TOOLS_NAV: readonly NavItem[] = [
  { id: 'marketplace', label: 'Plugins', icon: Puzzle },
  { id: 'issues', label: 'Bug Tracker', icon: Bug },
  { id: 'playground', label: 'Dev Playground', icon: Hammer },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SIDEBAR_WIDTH = 280;

export function TabletLayout() {
  const {
    sessions,
    currentSession,
    isCreatingSession,
    selectSession,
    deselectSession,
    createSession,
  } = useSandboxStore();
  useAutoReconnect();
  const { viewportHeight } = useKeyboard();
  const logout = useAuthStore((s) => s.logout);
  const [activeView, setActiveView] = useState<SidebarView>('chat');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const hasSession = !!currentSession;

  // Switch to chat when session changes
  const sessionId = currentSession?.id;
  useEffect(() => {
    if (sessionId) {
      setActiveView('chat');
    }
  }, [sessionId]);

  const handleNavClick = useCallback(
    (view: SidebarView) => {
      haptics.light();
      if (view === 'home') {
        deselectSession();
        setActiveView('home');
      } else {
        setActiveView(view);
      }
    },
    [deselectSession],
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      haptics.light();
      selectSession(id);
    },
    [selectSession],
  );

  const handleNewSession = useCallback(async () => {
    haptics.light();
    await createSession();
  }, [createSession]);

  const sessionName = currentSession
    ? (currentSession.metadata as { name?: string })?.name ||
      currentSession.id.slice(0, 8).toUpperCase()
    : null;

  const renderContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;
    if (
      !hasSession &&
      activeView !== 'settings' &&
      activeView !== 'marketplace'
    ) {
      return <WelcomeScreen />;
    }

    switch (activeView) {
      case 'home':
        return <WelcomeScreen />;
      case 'chat':
        return hasSession ? <ChatPanel /> : <WelcomeScreen />;
      case 'files':
        return hasSession ? (
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        ) : (
          <WelcomeScreen />
        );
      case 'terminal':
        return hasSession ? <XTerminal /> : <WelcomeScreen />;
      case 'settings':
        return <SettingsPage />;
      case 'marketplace':
        return <MarketplacePage />;
      case 'issues':
      case 'playground':
        // These remain as floating overlays
        return hasSession ? <ChatPanel /> : <WelcomeScreen />;
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: `${viewportHeight}px` }}
    >
      {/* Sidebar */}
      <nav
        className="flex shrink-0 flex-col safe-area-header overflow-y-auto"
        style={{
          width: `${SIDEBAR_WIDTH}px`,
          background: 'rgba(20, 20, 25, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRight: '0.5px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 512 512"
            className="shrink-0"
          >
            <rect width="512" height="512" rx="96" fill="#0f1419" />
            <path
              d="M222 230 L162 296 L222 362"
              stroke="#1dd3e6"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M290 230 L350 296 L290 362"
              stroke="#E945F5"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="text-base font-bold tracking-tight">
            VaporForge
          </span>
        </div>

        {/* Home */}
        <div className="px-3 mb-1">
          <SidebarItem
            icon={Home}
            label="Home"
            active={
              activeView === 'home' ||
              (!hasSession && activeView === 'chat')
            }
            onClick={() => handleNavClick('home')}
          />
        </div>

        {/* Session nav (visible when session active) */}
        {hasSession && (
          <div className="px-3 mb-2">
            <SidebarSectionLabel>Session</SidebarSectionLabel>
            {SESSION_NAV.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeView === item.id}
                onClick={() => handleNavClick(item.id)}
              />
            ))}
          </div>
        )}

        {/* Tools */}
        <div className="px-3 mb-2">
          <SidebarSectionLabel>Tools</SidebarSectionLabel>
          {TOOLS_NAV.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeView === item.id}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </div>

        {/* Sessions list */}
        {sessions.length > 0 && (
          <div className="px-3 mb-2">
            <SidebarSectionLabel>Sessions</SidebarSectionLabel>
            <button
              onClick={handleNewSession}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                'text-sm text-primary hover:bg-primary/10 transition-colors',
              ].join(' ')}
              style={{ minHeight: '36px' }}
            >
              + New Session
            </button>
            {sessions.slice(0, 10).map((session) => {
              const isActive = currentSession?.id === session.id;
              const name =
                (session.metadata as { name?: string })?.name ||
                session.id.slice(0, 8);
              const dotColor =
                session.status === 'active'
                  ? 'bg-green-500'
                  : session.status === 'sleeping'
                    ? 'bg-yellow-500'
                    : 'bg-gray-500';

              return (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                    'text-sm transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50',
                  ].join(' ')}
                  style={{ minHeight: '36px' }}
                >
                  <span
                    className={[
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      dotColor,
                    ].join(' ')}
                  />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Sign Out — bottom */}
        <div className="mt-auto px-3 pb-3">
          <SidebarItem
            icon={LogOut}
            label="Sign Out"
            active={false}
            onClick={() => {
              haptics.light();
              logout();
            }}
            variant="danger"
          />
        </div>
      </nav>

      {/* Content area */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden safe-area-header">
        {/* Content header with session name */}
        {sessionName &&
          activeView !== 'settings' &&
          activeView !== 'marketplace' && (
            <div
              className="flex shrink-0 items-center px-4 border-b border-border/50"
              style={{ height: '36px' }}
            >
              <span className="text-xs font-medium text-muted-foreground truncate">
                {sessionName}
              </span>
            </div>
          )}
        <div className="flex-1 overflow-hidden">{renderContent()}</div>
      </div>

      {/* Clone repo modal */}
      <CloneRepoModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
      />
    </div>
  );
}

function SidebarSectionLabel({
  children,
}: {
  readonly children: string;
}) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  variant,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly variant?: 'danger';
}) {
  const colorClass =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10'
      : active
        ? 'bg-primary/15 text-primary'
        : 'text-muted-foreground hover:bg-accent/50';

  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded-lg px-3 py-2',
        'text-[13px] font-medium transition-colors',
        colorClass,
      ].join(' ')}
      style={{ minHeight: '44px' }}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
      {label}
    </button>
  );
}
```

**Step 2: Update Layout.tsx to split tablet/phone routing**

In `Layout.tsx`, add the TabletLayout import at the top (after MobileLayout import):

```tsx
import { TabletLayout } from './TabletLayout';
```

Then replace the `isMobile` block (from Task 1) with separate tablet/phone checks:

```tsx
// iPad gets sidebar layout (Apple HIG)
if (layoutTier === 'tablet') {
  return (
    <>
      <TabletLayout />
      <QuickChatPanel />
      <CodeTransformPanel />
      <CodeAnalysisPanel />
      <CommitMessageCard />
      <TestResultsOverlay />
      <StackTraceOverlay />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
      <DebugPanel />
    </>
  );
}

// iPhone gets tab bar layout (Apple HIG)
if (layoutTier === 'phone') {
  return (
    <>
      <MobileLayout />
      <QuickChatPanel />
      <CodeTransformPanel />
      <CodeAnalysisPanel />
      <CommitMessageCard />
      <TestResultsOverlay />
      <StackTraceOverlay />
      <IssueTracker />
      <DevChangelog />
      <DevPlayground />
      <DebugPanel />
    </>
  );
}
```

Also:
- Remove the `isMobile` variable (line 42) — no longer needed
- Remove the tablet collapse effect (lines 131-137) — TabletLayout manages its own layout
- Simplify panel defaults to desktop-only values:
  ```tsx
  const fileTreeDefaultSize = 15;
  const chatDefaultSize = 55;
  const rightDefaultSize = 30;
  ```

**Step 3: Verify build**

Run: `cd ~/vaporforge && npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add ui/src/components/TabletLayout.tsx ui/src/components/Layout.tsx
git commit -m "feat: create TabletLayout (iPad sidebar) and split tablet/phone routing"
```

---

### Task 7: Build, Test, and Deploy

**Files:** None (verification only)

**Step 1: Full build**

Run: `cd ~/vaporforge && npm run build`
Expected: Clean build with no errors.

**Step 2: Local verification**

Run: `cd ~/vaporforge && npm run dev` (in one terminal)
Run: `cd ~/vaporforge && npm run dev:ui` (in another terminal)

Test in browser:
- Desktop (>= 1024px): Unchanged — 3-panel layout
- iPad viewport (768-1023px or iPad UA): Sidebar layout with nav on left
- iPhone viewport (<768px): Tab bar + nav bar layout
- Open Settings from More tab on phone: Renders within MobileLayout, tab bar stays, nav bar shows "Settings" + Back
- Open Plugins from More tab on phone: Renders within MobileLayout
- Tap Back: Returns to More menu
- Open Settings from sidebar on iPad: Renders in content area, sidebar stays

**Step 3: Deploy**

Run: `cd ~/vaporforge && npm run deploy`
Expected: Successful Cloudflare deployment.

**Step 4: Version bump**

Update `CLAUDE.md` version from `0.22.0` to `0.23.0`.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: v0.23.0 — Mobile Layout Redesign (Apple HIG)"
```

---

## Summary of Changes

| # | Task | Files | Commits |
|---|------|-------|---------|
| 1 | Fix routing order | Layout.tsx | 1 |
| 2 | Add subView state | useMobileNav.ts | 1 |
| 3 | HIG tab bar | MobileTabBar.tsx | 1 |
| 4 | Create nav bar | MobileNavBar.tsx (new) | 1 |
| 5 | Overhaul MobileLayout | MobileLayout.tsx, MoreMenu.tsx | 1 |
| 6 | Create TabletLayout | TabletLayout.tsx (new), Layout.tsx | 1 |
| 7 | Build, test, deploy | None (verification) | 1 |

**Total: 7 tasks, ~7 commits, 2 new files, 5 modified files**
