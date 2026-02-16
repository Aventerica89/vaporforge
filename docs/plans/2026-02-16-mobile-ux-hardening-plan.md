# Mobile UX Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform VaporForge mobile from hamburger-drawer navigation to Termius-quality iOS tab bar experience, then harden the codebase with file splits and test coverage.

**Architecture:** Replace MobileLayout's hamburger+bottom-sheet pattern with a persistent iOS tab bar (`MobileTabBar`). Each tab renders its view inline (Chat, Files, Terminal, More). Swipe gestures navigate between tabs. iPad gets a sidebar variant. Terminal gains an extra-keys toolbar above the keyboard. Code quality pass splits oversized files and adds tests.

**Tech Stack:** React 18, Tailwind v3.4, xterm.js, Zustand, Cloudflare Workers

**Branch:** `refine/mobile-ux-hardening`
**Preview deploy:** `npm run build && npx wrangler deploy --env preview`
**Preview URL:** `https://vaporforge-preview.jbmd-creations.workers.dev`

---

## Phase 1: Mobile Tab Bar Navigation

### Task 1: Create MobileTabBar component

**Files:**
- Create: `ui/src/components/mobile/MobileTabBar.tsx`
- Test: `ui/src/__tests__/MobileTabBar.test.tsx`

**Step 1: Create the mobile directory**

```bash
mkdir -p ui/src/components/mobile
```

**Step 2: Write the failing test**

Create `ui/src/__tests__/MobileTabBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTabBar } from '../components/mobile/MobileTabBar';

describe('MobileTabBar', () => {
  const defaultProps = {
    activeTab: 'chat' as const,
    onTabChange: vi.fn(),
    hasSession: true,
    keyboardOpen: false,
  };

  it('renders all tabs when session is active', () => {
    render(<MobileTabBar {...defaultProps} />);
    expect(screen.getByLabelText('Chat')).toBeDefined();
    expect(screen.getByLabelText('Files')).toBeDefined();
    expect(screen.getByLabelText('Terminal')).toBeDefined();
    expect(screen.getByLabelText('More')).toBeDefined();
  });

  it('renders only Home and More when no session', () => {
    render(<MobileTabBar {...defaultProps} hasSession={false} />);
    expect(screen.getByLabelText('Home')).toBeDefined();
    expect(screen.getByLabelText('More')).toBeDefined();
    expect(screen.queryByLabelText('Files')).toBeNull();
    expect(screen.queryByLabelText('Terminal')).toBeNull();
  });

  it('calls onTabChange when tab is tapped', () => {
    render(<MobileTabBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Files'));
    expect(defaultProps.onTabChange).toHaveBeenCalledWith('files');
  });

  it('hides when keyboard is open', () => {
    const { container } = render(
      <MobileTabBar {...defaultProps} keyboardOpen />
    );
    const tabBar = container.firstChild as HTMLElement;
    expect(tabBar.className).toContain('translate-y-full');
  });

  it('highlights the active tab', () => {
    render(<MobileTabBar {...defaultProps} activeTab="files" />);
    const filesTab = screen.getByLabelText('Files');
    expect(filesTab.className).toContain('text-primary');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd ui && npx vitest run src/__tests__/MobileTabBar.test.tsx`
Expected: FAIL — module not found

**Step 4: Write MobileTabBar implementation**

Create `ui/src/components/mobile/MobileTabBar.tsx`:

```tsx
import { memo } from 'react';
import {
  MessageSquare,
  FolderTree,
  Terminal,
  MoreHorizontal,
  Home,
} from 'lucide-react';
import { haptics } from '@/lib/haptics';

export type MobileTab = 'chat' | 'files' | 'terminal' | 'more' | 'home';

interface TabDef {
  id: MobileTab;
  label: string;
  icon: typeof MessageSquare;
}

const SESSION_TABS: TabDef[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

const NO_SESSION_TABS: TabDef[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasSession: boolean;
  keyboardOpen: boolean;
}

export const MobileTabBar = memo(function MobileTabBar({
  activeTab,
  onTabChange,
  hasSession,
  keyboardOpen,
}: MobileTabBarProps) {
  const tabs = hasSession ? SESSION_TABS : NO_SESSION_TABS;

  const handleTap = (tab: MobileTab) => {
    if (tab !== activeTab) {
      haptics.light();
      onTabChange(tab);
    }
  };

  return (
    <nav
      className={`
        flex shrink-0 items-stretch border-t border-border
        bg-card/95 backdrop-blur-md safe-bottom
        transition-transform duration-200
        ${keyboardOpen ? 'translate-y-full' : 'translate-y-0'}
      `}
      style={{ minHeight: '49px' }}
      role="tablist"
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
            onClick={() => handleTap(tab.id)}
            className={`
              flex flex-1 flex-col items-center justify-center gap-0.5 py-1
              transition-colors duration-150
              ${isActive ? 'text-primary' : 'text-muted-foreground'}
            `}
          >
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
});
```

**Step 5: Run test to verify it passes**

Run: `cd ui && npx vitest run src/__tests__/MobileTabBar.test.tsx`
Expected: PASS (5 tests)

**Step 6: Commit**

```bash
git add ui/src/components/mobile/MobileTabBar.tsx ui/src/__tests__/MobileTabBar.test.tsx
git commit -m "feat(mobile): add MobileTabBar component with tests"
```

---

### Task 2: Create tab-aware mobile state hook

**Files:**
- Create: `ui/src/hooks/useMobileNav.ts`
- Test: `ui/src/__tests__/useMobileNav.test.ts`

**Step 1: Write the failing test**

Create `ui/src/__tests__/useMobileNav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileNav } from '../hooks/useMobileNav';

describe('useMobileNav', () => {
  it('defaults to chat tab', () => {
    const { result } = renderHook(() => useMobileNav());
    expect(result.current.activeTab).toBe('chat');
  });

  it('switches tab', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => result.current.setActiveTab('files'));
    expect(result.current.activeTab).toBe('files');
  });

  it('resets to chat when session changes', () => {
    const { result } = renderHook(() => useMobileNav());
    act(() => result.current.setActiveTab('terminal'));
    act(() => result.current.onSessionChange());
    expect(result.current.activeTab).toBe('chat');
  });

  it('tracks swipe direction for animation', () => {
    const { result } = renderHook(() => useMobileNav());
    // chat(0) -> files(1) = swipe left (forward)
    act(() => result.current.setActiveTab('files'));
    expect(result.current.swipeDirection).toBe('left');
    // files(1) -> chat(0) = swipe right (backward)
    act(() => result.current.setActiveTab('chat'));
    expect(result.current.swipeDirection).toBe('right');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ui && npx vitest run src/__tests__/useMobileNav.test.ts`
Expected: FAIL — module not found

**Step 3: Write useMobileNav implementation**

Create `ui/src/hooks/useMobileNav.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';

const TAB_ORDER: MobileTab[] = ['chat', 'files', 'terminal', 'more'];

export type SwipeDirection = 'left' | 'right' | null;

export function useMobileNav() {
  const [activeTab, setActiveTabState] = useState<MobileTab>('chat');
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const prevIndexRef = useRef(0);

  const setActiveTab = useCallback((tab: MobileTab) => {
    const newIndex = TAB_ORDER.indexOf(tab);
    const prevIndex = prevIndexRef.current;
    setSwipeDirection(newIndex > prevIndex ? 'left' : 'right');
    prevIndexRef.current = newIndex >= 0 ? newIndex : 0;
    setActiveTabState(tab);
  }, []);

  const onSessionChange = useCallback(() => {
    setActiveTabState('chat');
    prevIndexRef.current = 0;
    setSwipeDirection(null);
  }, []);

  return { activeTab, setActiveTab, swipeDirection, onSessionChange };
}
```

**Step 4: Run test to verify it passes**

Run: `cd ui && npx vitest run src/__tests__/useMobileNav.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add ui/src/hooks/useMobileNav.ts ui/src/__tests__/useMobileNav.test.ts
git commit -m "feat(mobile): add useMobileNav hook with swipe direction tracking"
```

---

### Task 3: Create MoreMenu component (replaces drawer contents)

**Files:**
- Create: `ui/src/components/mobile/MoreMenu.tsx`

**Step 1: Write MoreMenu**

This component renders the contents of the "More" tab — session list, settings, plugins, sign out. It replaces what MobileDrawer currently shows, but rendered inline instead of as an overlay.

Create `ui/src/components/mobile/MoreMenu.tsx`:

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
import { useSettingsStore } from '@/hooks/useSettings';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { usePlayground } from '@/hooks/usePlayground';
import { haptics } from '@/lib/haptics';

interface MoreMenuProps {
  onOpenCloneModal: () => void;
  onSelectSession: (id: string) => void;
}

export function MoreMenu({ onOpenCloneModal, onSelectSession }: MoreMenuProps) {
  const { sessions, currentSession, createSession } = useSandboxStore();
  const { logout } = useAuthStore();
  const { openSettings } = useSettingsStore();
  const { openTracker } = useIssueTracker();

  const handleNewSession = async () => {
    haptics.light();
    await createSession();
  };

  const menuItem = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    variant?: 'danger'
  ) => (
    <button
      onClick={() => { haptics.light(); onClick(); }}
      className={`
        flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium
        transition-colors active:scale-[0.98]
        ${variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10'
          : 'hover:bg-accent'}
      `}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Quick Actions */}
      <div className="p-3 space-y-0.5">
        <h4 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Actions
        </h4>
        {menuItem(<Plus className="h-4.5 w-4.5 text-primary" />, 'New Session', handleNewSession)}
        {menuItem(<GitBranch className="h-4.5 w-4.5 text-secondary" />, 'Clone Repo', onOpenCloneModal)}
      </div>

      {/* Sessions */}
      {sessions.length > 0 && (
        <div className="p-3 space-y-0.5">
          <h4 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sessions
          </h4>
          {sessions.slice(0, 10).map((session) => {
            const isActive = currentSession?.id === session.id;
            const name =
              (session.metadata as { name?: string })?.name ||
              session.id.slice(0, 8);
            return (
              <button
                key={session.id}
                onClick={() => { haptics.light(); onSelectSession(session.id); }}
                className={`
                  flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm
                  transition-colors active:scale-[0.98]
                  ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}
                `}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    session.status === 'active'
                      ? 'bg-green-500 shadow-[0_0_6px_rgb(34,197,94)]'
                      : session.status === 'sleeping'
                        ? 'bg-yellow-500'
                        : 'bg-gray-500'
                  }`}
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
        <h4 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Tools
        </h4>
        {menuItem(<Bug className="h-4.5 w-4.5 text-orange-500" />, 'Bug Tracker', () => openTracker())}
        {menuItem(<Hammer className="h-4.5 w-4.5 text-amber-500" />, 'Dev Playground', () => usePlayground.getState().openPlayground())}
        {menuItem(<Puzzle className="h-4.5 w-4.5 text-primary" />, 'Plugins', () => useMarketplace.getState().openMarketplace())}
        {menuItem(<Settings className="h-4.5 w-4.5 text-muted-foreground" />, 'Settings', () => openSettings())}
      </div>

      {/* Sign Out */}
      <div className="p-3 mt-auto">
        {menuItem(<LogOut className="h-4.5 w-4.5" />, 'Sign Out', () => logout(), 'danger')}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add ui/src/components/mobile/MoreMenu.tsx
git commit -m "feat(mobile): add MoreMenu component for tab bar More view"
```

---

### Task 4: Rewrite MobileLayout with tab bar navigation

**Files:**
- Modify: `ui/src/components/MobileLayout.tsx`

This is the core change. Replace the hamburger+drawer+sheet pattern with tab bar routing.

**Step 1: Rewrite MobileLayout.tsx**

The new MobileLayout:
- Uses `useMobileNav` for active tab state
- Renders `MobileTabBar` at bottom
- Renders tab content inline (no more sheets for files/terminal)
- Keeps `MobileBottomSheet` only for overlays (clone modal)
- Tab bar hides when keyboard is open
- Session header simplified (no hamburger)

```tsx
import { useState, useEffect } from 'react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useMobileNav } from '@/hooks/useMobileNav';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MoreMenu } from './mobile/MoreMenu';
import { ChatPanel } from './ChatPanel';
import { FileTree } from './FileTree';
import { XTerminal } from './XTerminal';
import { CloneRepoModal } from './CloneRepoModal';
import { WelcomeScreen } from './WelcomeScreen';
import { SessionBootScreen } from './SessionBootScreen';

export function MobileLayout() {
  const { currentSession, isCreatingSession, selectSession } = useSandboxStore();
  useAutoReconnect();
  const { isVisible: keyboardOpen, viewportHeight } = useKeyboard();
  const { activeTab, setActiveTab, onSessionChange } = useMobileNav();
  const [showCloneModal, setShowCloneModal] = useState(false);
  const containerHeight = `${viewportHeight}px`;

  // Reset to chat tab when session changes
  const sessionId = currentSession?.id;
  useEffect(() => {
    onSessionChange();
  }, [sessionId, onSessionChange]);

  const hasSession = !!currentSession;

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
    : '';

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  // Render the active tab content
  const renderTabContent = () => {
    if (isCreatingSession) return <SessionBootScreen />;

    if (!hasSession) {
      if (activeTab === 'more') {
        return (
          <MoreMenu
            onOpenCloneModal={() => setShowCloneModal(true)}
            onSelectSession={handleSelectSession}
          />
        );
      }
      return <WelcomeScreen />;
    }

    switch (activeTab) {
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
      {/* Top bar — minimal: session name + status */}
      <div
        className="flex shrink-0 items-center justify-center border-b border-border bg-card/95 backdrop-blur-md px-4 safe-area-header"
        style={{ minHeight: '44px' }}
      >
        <div className="flex items-center gap-2">
          {currentSession && (
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          )}
          <span className="max-w-[200px] truncate text-sm font-semibold">
            {sessionName}
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {renderTabContent()}
      </div>

      {/* Tab bar */}
      <MobileTabBar
        activeTab={hasSession ? activeTab : (activeTab === 'more' ? 'more' : 'home')}
        onTabChange={setActiveTab}
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

**Step 2: Run the full test suite to verify nothing is broken**

Run: `cd ~/vaporforge && npm test -- --run`
Expected: All existing tests pass

**Step 3: Build and deploy to preview**

```bash
npm run build && npx wrangler deploy --env preview
```

**Step 4: Test on iPhone at preview URL**

Verify:
- Tab bar appears at bottom with 4 tabs (Chat, Files, Terminal, More)
- Tapping tabs switches views
- Tab bar hides when keyboard opens
- More tab shows sessions, settings, sign out
- No-session state shows Home + More tabs
- Safe area respected on notched devices

**Step 5: Commit**

```bash
git add ui/src/components/MobileLayout.tsx
git commit -m "feat(mobile): replace hamburger drawer with iOS tab bar navigation"
```

---

### Task 5: Add tab bar CSS and safe area polish

**Files:**
- Modify: `ui/src/index.css`

**Step 1: Add tab bar styles to index.css**

Add after the existing mobile CSS section:

```css
/* Mobile Tab Bar */
.mobile-tab-bar {
  -webkit-tap-highlight-color: transparent;
}

/* Tab content transition */
.tab-content-enter {
  opacity: 0;
  transform: translateX(20px);
}
.tab-content-enter-active {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 150ms ease, transform 150ms ease;
}
```

**Step 2: Commit**

```bash
git add ui/src/index.css
git commit -m "style(mobile): add tab bar CSS transitions"
```

---

### Task 6: Add swipe gesture between tabs

**Files:**
- Create: `ui/src/hooks/useSwipeTabs.ts`
- Modify: `ui/src/components/MobileLayout.tsx`

**Step 1: Write useSwipeTabs hook**

Create `ui/src/hooks/useSwipeTabs.ts`:

```ts
import { useRef, useCallback } from 'react';
import type { MobileTab } from '@/components/mobile/MobileTabBar';
import { haptics } from '@/lib/haptics';

const SESSION_TAB_ORDER: MobileTab[] = ['chat', 'files', 'terminal', 'more'];
const SWIPE_THRESHOLD = 50; // minimum px to trigger tab switch
const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms

interface UseSwipeTabsOptions {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasSession: boolean;
}

export function useSwipeTabs({ activeTab, onTabChange, hasSession }: UseSwipeTabsOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const tabs = hasSession ? SESSION_TAB_ORDER : (['home', 'more'] as MobileTab[]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = null;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isHorizontalSwipe.current !== true) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = Math.abs(deltaX) / elapsed;

    const isSwipe = Math.abs(deltaX) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;
    if (!isSwipe) return;

    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < 0) return;

    if (deltaX < 0 && currentIndex < tabs.length - 1) {
      haptics.light();
      onTabChange(tabs[currentIndex + 1]);
    } else if (deltaX > 0 && currentIndex > 0) {
      haptics.light();
      onTabChange(tabs[currentIndex - 1]);
    }
  }, [activeTab, onTabChange, tabs]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    // Determine if this is a horizontal or vertical swipe (lock after 10px)
    if (isHorizontalSwipe.current === null) {
      const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
      const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
      if (dx > 10 || dy > 10) {
        isHorizontalSwipe.current = dx > dy;
      }
    }
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
```

**Step 2: Integrate into MobileLayout**

In `MobileLayout.tsx`, add the swipe handlers to the tab content wrapper:

```tsx
// Add import
import { useSwipeTabs } from '@/hooks/useSwipeTabs';

// Inside MobileLayout, after useMobileNav:
const swipeHandlers = useSwipeTabs({
  activeTab,
  onTabChange: setActiveTab,
  hasSession,
});

// Wrap tab content div:
<div
  className="flex flex-1 flex-col min-h-0 overflow-hidden"
  {...swipeHandlers}
>
  {renderTabContent()}
</div>
```

**Step 3: Build and deploy to preview**

```bash
npm run build && npx wrangler deploy --env preview
```

**Step 4: Test swipe on iPhone**

Verify:
- Swipe left goes to next tab (Chat -> Files -> Terminal -> More)
- Swipe right goes to previous tab
- Vertical scrolling still works (not intercepted)
- Haptic feedback on tab switch

**Step 5: Commit**

```bash
git add ui/src/hooks/useSwipeTabs.ts ui/src/components/MobileLayout.tsx
git commit -m "feat(mobile): add swipe gesture navigation between tabs"
```

---

### Task 7: Deprecate MobileDrawer (keep for reference, remove from layout)

**Files:**
- Modify: `ui/src/components/MobileLayout.tsx` (remove MobileDrawer import if still present)

**Step 1: Verify MobileDrawer is no longer imported in MobileLayout**

After Task 4, MobileDrawer should already be removed from MobileLayout. Verify and remove any lingering references. Do NOT delete MobileDrawer.tsx yet — we may reuse parts for the iPad sidebar later.

**Step 2: Commit (if changes made)**

```bash
git add -A && git commit -m "refactor(mobile): remove MobileDrawer from layout (tab bar replaces it)"
```

---

### Task 8: Preview deploy + iPhone/iPad testing checkpoint

**No code changes. This is a testing checkpoint.**

```bash
npm run build && npx wrangler deploy --env preview
```

**Test checklist (iPhone):**
- [ ] Tab bar visible at bottom with 4 icons
- [ ] Each tab renders correct content
- [ ] Swipe between tabs works
- [ ] Keyboard opens: tab bar hides
- [ ] Keyboard closes: tab bar returns
- [ ] Safe area inset respected (home indicator)
- [ ] Session status dot in header
- [ ] More > Settings opens settings page
- [ ] More > New Session creates session
- [ ] More > Sign Out works
- [ ] No-session state: Home + More tabs only

**Test checklist (iPad — if available):**
- [ ] Tab bar works at tablet tier
- [ ] Layout doesn't break at 768-1024px width

---

## Phase 2: Terminal Touch Experience

### Task 9: Create ExtraKeysToolbar component

**Files:**
- Create: `ui/src/components/mobile/ExtraKeysToolbar.tsx`
- Test: `ui/src/__tests__/ExtraKeysToolbar.test.tsx`

**Step 1: Write the failing test**

Create `ui/src/__tests__/ExtraKeysToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtraKeysToolbar } from '../components/mobile/ExtraKeysToolbar';

describe('ExtraKeysToolbar', () => {
  const onKey = vi.fn();

  it('renders default extra keys', () => {
    render(<ExtraKeysToolbar onKey={onKey} visible />);
    expect(screen.getByText('Esc')).toBeDefined();
    expect(screen.getByText('Tab')).toBeDefined();
    expect(screen.getByText('Ctrl')).toBeDefined();
  });

  it('calls onKey with correct value when tapped', () => {
    render(<ExtraKeysToolbar onKey={onKey} visible />);
    fireEvent.click(screen.getByText('Tab'));
    expect(onKey).toHaveBeenCalledWith('\t');
  });

  it('supports Ctrl as a modifier toggle', () => {
    render(<ExtraKeysToolbar onKey={onKey} visible />);
    const ctrlBtn = screen.getByText('Ctrl');
    fireEvent.click(ctrlBtn);
    // Ctrl should be visually toggled (active state)
    expect(ctrlBtn.className).toContain('bg-primary');
  });

  it('hides when visible is false', () => {
    const { container } = render(<ExtraKeysToolbar onKey={onKey} visible={false} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ui && npx vitest run src/__tests__/ExtraKeysToolbar.test.tsx`
Expected: FAIL

**Step 3: Write ExtraKeysToolbar implementation**

Create `ui/src/components/mobile/ExtraKeysToolbar.tsx`:

```tsx
import { useState, memo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { haptics } from '@/lib/haptics';

interface KeyDef {
  label: string;
  value: string;
  isModifier?: boolean;
  icon?: typeof ChevronUp;
}

const DEFAULT_KEYS: KeyDef[] = [
  { label: 'Esc', value: '\x1b' },
  { label: 'Tab', value: '\t' },
  { label: 'Ctrl', value: 'ctrl', isModifier: true },
  { label: '|', value: '|' },
  { label: '/', value: '/' },
  { label: '-', value: '-' },
  { label: '~', value: '~' },
  { label: '', value: '\x1b[A', icon: ChevronUp },
  { label: '', value: '\x1b[B', icon: ChevronDown },
  { label: '', value: '\x1b[D', icon: ChevronLeft },
  { label: '', value: '\x1b[C', icon: ChevronRight },
];

interface ExtraKeysToolbarProps {
  onKey: (value: string) => void;
  visible: boolean;
}

export const ExtraKeysToolbar = memo(function ExtraKeysToolbar({
  onKey,
  visible,
}: ExtraKeysToolbarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);

  if (!visible) return null;

  const handleKey = (key: KeyDef) => {
    haptics.light();

    if (key.isModifier) {
      setCtrlActive((prev) => !prev);
      return;
    }

    if (ctrlActive && key.value.length === 1) {
      // Ctrl+letter = char code 1-26
      const code = key.value.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code <= 26) {
        onKey(String.fromCharCode(code));
      } else {
        onKey(key.value);
      }
      setCtrlActive(false);
    } else {
      onKey(key.value);
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-card border-t border-border overflow-x-auto">
      {DEFAULT_KEYS.map((key, i) => {
        const Icon = key.icon;
        const isActive = key.isModifier && ctrlActive;
        return (
          <button
            key={key.value + i}
            onClick={() => handleKey(key)}
            className={`
              flex shrink-0 items-center justify-center rounded-md px-3 py-1.5
              text-xs font-medium transition-colors active:scale-95
              ${isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-accent text-foreground'}
            `}
            style={{ minWidth: '36px', minHeight: '32px' }}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : key.label}
          </button>
        );
      })}
    </div>
  );
});
```

**Step 4: Run test to verify it passes**

Run: `cd ui && npx vitest run src/__tests__/ExtraKeysToolbar.test.tsx`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add ui/src/components/mobile/ExtraKeysToolbar.tsx ui/src/__tests__/ExtraKeysToolbar.test.tsx
git commit -m "feat(mobile): add ExtraKeysToolbar for terminal touch input"
```

---

### Task 10: Integrate ExtraKeysToolbar into XTerminal on mobile

**Files:**
- Modify: `ui/src/components/XTerminal.tsx`

**Step 1: Add ExtraKeysToolbar to XTerminal**

In XTerminal, detect when the terminal is focused on mobile and show the extra keys toolbar. The toolbar should appear between the terminal and the keyboard.

Add the following changes to XTerminal.tsx:

1. Import `ExtraKeysToolbar` and `useDeviceInfo`
2. Track terminal focus state via `terminalFocused` ref/state
3. Render `ExtraKeysToolbar` below the terminal when focused + mobile
4. Wire `onKey` to write directly to the xterm instance

Key integration point — the `onKey` handler writes to the terminal:

```tsx
const handleExtraKey = useCallback((value: string) => {
  if (termRef.current) {
    termRef.current.focus();
    // Write the key sequence directly to the terminal
    termRef.current.paste(value);
  }
}, []);
```

Render toolbar conditionally:

```tsx
{isMobile && (
  <ExtraKeysToolbar
    onKey={handleExtraKey}
    visible={terminalFocused}
  />
)}
```

**Step 2: Build and deploy to preview**

```bash
npm run build && npx wrangler deploy --env preview
```

**Step 3: Test on iPhone**

Verify:
- Open Terminal tab
- Tap the terminal area
- Extra keys toolbar appears above keyboard
- Esc, Tab, Ctrl, arrows all send correct sequences
- Ctrl toggles on/off (visual indicator)
- Toolbar scrolls horizontally if too wide

**Step 4: Commit**

```bash
git add ui/src/components/XTerminal.tsx
git commit -m "feat(mobile): integrate extra keys toolbar in terminal on mobile"
```

---

### Task 11: Add command history suggestions

**Files:**
- Create: `ui/src/components/mobile/CommandSuggestions.tsx`
- Create: `ui/src/hooks/useCommandHistory.ts`
- Modify: `ui/src/components/XTerminal.tsx`

**Step 1: Create useCommandHistory hook**

Create `ui/src/hooks/useCommandHistory.ts`:

```ts
import { useState, useCallback } from 'react';

const MAX_HISTORY = 50;
const STORAGE_KEY = 'vf-cmd-history';

function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>(loadHistory);

  const addCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || trimmed.length < 2) return;
    setHistory((prev) => {
      const filtered = prev.filter((c) => c !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const getSuggestions = useCallback(
    (input: string): string[] => {
      if (!input || input.length < 1) return [];
      const lower = input.toLowerCase();
      return history
        .filter((cmd) => cmd.toLowerCase().startsWith(lower) && cmd !== input)
        .slice(0, 5);
    },
    [history]
  );

  return { history, addCommand, getSuggestions };
}
```

**Step 2: Create CommandSuggestions component**

Create `ui/src/components/mobile/CommandSuggestions.tsx`:

```tsx
import { memo } from 'react';
import { haptics } from '@/lib/haptics';

interface CommandSuggestionsProps {
  suggestions: string[];
  onSelect: (cmd: string) => void;
}

export const CommandSuggestions = memo(function CommandSuggestions({
  suggestions,
  onSelect,
}: CommandSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex gap-1.5 px-2 py-1.5 overflow-x-auto border-t border-border bg-card/95">
      {suggestions.map((cmd) => (
        <button
          key={cmd}
          onClick={() => { haptics.light(); onSelect(cmd); }}
          className="
            shrink-0 rounded-full bg-muted px-3 py-1.5
            text-xs font-mono text-foreground
            hover:bg-accent active:scale-95 transition-all
          "
        >
          {cmd}
        </button>
      ))}
    </div>
  );
});
```

**Step 3: Integrate into XTerminal**

Wire command history tracking into the terminal's command execution flow. When a command is detected (newline entered), save it to history. Show suggestions above the extra keys toolbar.

**Step 4: Build, deploy, test on iPhone**

```bash
npm run build && npx wrangler deploy --env preview
```

Verify:
- Type partial command in terminal
- Suggestions appear as tappable pills
- Tapping a suggestion inserts it
- History persists across sessions (localStorage)

**Step 5: Commit**

```bash
git add ui/src/hooks/useCommandHistory.ts ui/src/components/mobile/CommandSuggestions.tsx ui/src/components/XTerminal.tsx
git commit -m "feat(mobile): add command history suggestions in terminal"
```

---

## Phase 3: Chat UX Polish

### Task 12: Add scroll-to-bottom FAB

**Files:**
- Modify: `ui/src/components/ChatPanel.tsx`

**Step 1: Add a floating "scroll to bottom" button**

When the user scrolls up during streaming, show a floating button at the bottom-right that scrolls back to the latest message.

Track scroll position via an `IntersectionObserver` on the `messagesEndRef` div. When it's not visible, show the FAB.

**Step 2: Build, deploy, test**

**Step 3: Commit**

```bash
git commit -m "feat(chat): add scroll-to-bottom FAB when scrolled up during streaming"
```

---

### Task 13: Add long-press message actions on mobile

**Files:**
- Create: `ui/src/components/mobile/MessageLongPress.tsx`
- Modify: `ui/src/components/chat/message/Message.tsx`

**Step 1: Create MessageLongPress context menu**

A long-press (500ms) on a message shows a floating action menu: Copy, Retry, Share.

Use `onTouchStart` + `setTimeout` pattern with `onTouchEnd` cancellation. Position the menu near the touch point.

**Step 2: Wire into Message component**

Add long-press handlers to the Message wrapper on mobile only (check `useDeviceInfo`).

**Step 3: Build, deploy, test**

**Step 4: Commit**

```bash
git commit -m "feat(mobile): add long-press context menu for chat messages"
```

---

### Task 14: Preview deploy + full mobile testing checkpoint

**No code changes. Full testing pass.**

```bash
npm run build && npx wrangler deploy --env preview
```

**Complete test checklist:**
- [ ] Tab bar navigation (all 4 tabs)
- [ ] Swipe between tabs
- [ ] Terminal extra keys toolbar
- [ ] Command history suggestions
- [ ] Scroll-to-bottom FAB in chat
- [ ] Long-press message actions
- [ ] Keyboard show/hide behavior
- [ ] Safe areas on notched devices
- [ ] No regressions on desktop (load production URL)

---

## Phase 4: Code Quality Hardening

### Task 15: Split McpTab.tsx (1,534 lines)

**Files:**
- Create: `ui/src/components/settings/mcp/McpServerList.tsx`
- Create: `ui/src/components/settings/mcp/McpServerForm.tsx`
- Create: `ui/src/components/settings/mcp/McpCredentials.tsx`
- Create: `ui/src/components/settings/mcp/McpToolDiscovery.tsx`
- Create: `ui/src/components/settings/mcp/index.ts` (barrel export)
- Modify: `ui/src/components/settings/McpTab.tsx` (reduce to orchestrator, <200 lines)

**Strategy:** Read McpTab.tsx, identify natural component boundaries, extract into separate files. McpTab becomes a thin orchestrator that composes the sub-components.

**Step 1: Read and analyze McpTab.tsx for component boundaries**
**Step 2: Extract McpServerList (server list with toggle/delete/ping)**
**Step 3: Extract McpServerForm (add/edit server form with JSON paste)**
**Step 4: Extract McpCredentials (credential file upload/management)**
**Step 5: Extract McpToolDiscovery (tool list pills)**
**Step 6: Reduce McpTab to orchestrator**
**Step 7: Run tests, build, verify nothing breaks**
**Step 8: Commit**

```bash
git commit -m "refactor: split McpTab.tsx (1534 -> 5 files, each <400 lines)"
```

---

### Task 16: Split plugins.ts (1,102 lines)

**Files:**
- Create: `src/api/plugin-discovery.ts`
- Create: `src/api/plugin-catalog.ts`
- Create: `src/api/plugin-github.ts`
- Modify: `src/api/plugins.ts` (reduce to route registration, <200 lines)

**Strategy:** Extract discovery logic, catalog management, and GitHub API helpers into separate files. plugins.ts becomes a thin route file.

**Step 1-5: Same extract pattern as Task 15**
**Step 6: Commit**

```bash
git commit -m "refactor: split plugins.ts (1102 -> 4 files)"
```

---

### Task 17: Split sandbox.ts (1,016 lines)

**Files:**
- Create: `src/services/sandbox-lifecycle.ts` (create, resume, destroy)
- Create: `src/services/sandbox-injection.ts` (agents, secrets, credentials, MCP)
- Create: `src/services/sandbox-files.ts` (file read/write/exec)
- Modify: `src/sandbox.ts` (reduce to exports + orchestration)

**Step 1-5: Same extract pattern**
**Step 6: Commit**

```bash
git commit -m "refactor: split sandbox.ts (1016 -> 4 files)"
```

---

### Task 18: Add backend test coverage for critical paths

**Files:**
- Create: `src/api/__tests__/sessions.test.ts`
- Create: `src/api/__tests__/sdk.test.ts`
- Create: `src/services/__tests__/config-assembly.test.ts`

**Target:** Auth (already has 5 tests) + sessions CRUD + WS proxy setup + config assembly = 60% backend coverage goal.

**Step 1: Write session CRUD tests**
**Step 2: Write config assembly tests (MCP, secrets, credentials injection)**
**Step 3: Write SDK proxy setup tests**
**Step 4: Run full test suite, verify coverage**
**Step 5: Commit**

```bash
git commit -m "test: add backend tests for sessions, sdk, config-assembly (60% coverage)"
```

---

### Task 19: Add frontend test coverage for critical paths

**Files:**
- Create: `ui/src/__tests__/ChatPanel.test.tsx`
- Create: `ui/src/__tests__/useSandbox.test.ts`
- Create: `ui/src/__tests__/useWebSocket.test.ts`

**Target:** ChatPanel rendering, sandbox store actions, WebSocket hook = 40% frontend coverage goal.

**Step 1-4: Same TDD pattern**
**Step 5: Commit**

```bash
git commit -m "test: add frontend tests for ChatPanel, useSandbox, useWebSocket (40% coverage)"
```

---

### Task 20: Error handling + security audit

**Files:**
- Audit: all `src/api/*.ts` files for consistent error responses
- Audit: all API endpoints for input validation
- Add: Zod schemas where missing

**Step 1: Audit each API file for error response consistency**
**Step 2: Add Zod validation to any unvalidated endpoints**
**Step 3: Verify no sensitive data in error messages**
**Step 4: Commit**

```bash
git commit -m "fix: standardize error handling and add input validation across API"
```

---

### Task 21: Final preview deploy + regression testing

**Full build + deploy:**

```bash
npm run build && npx wrangler deploy --env preview
```

**Full regression checklist:**
- [ ] All Phase 1-3 mobile features working
- [ ] Desktop layout unaffected
- [ ] All tests pass
- [ ] No console errors
- [ ] Auth flow works
- [ ] Session create/resume/delete works
- [ ] Chat streaming works
- [ ] Terminal works
- [ ] File tree works
- [ ] Settings pages load
- [ ] MCP server management works

---

### Task 22: Merge to main + production deploy

When all testing passes:

```bash
git checkout main
git merge refine/mobile-ux-hardening
npm run build && npx wrangler deploy
```

Bump version in package.json to `0.23.0`.

```bash
git commit -m "chore: bump version to 0.23.0"
git push origin main
```
