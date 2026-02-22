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

/** H2 HIG fix: Use CSS design tokens instead of hardcoded hex values.
 *  Active: hsl(var(--primary)) — adapts to theme.
 *  Inactive: hsl(var(--muted-foreground)) — adapts to dark/light mode. */
const ACTIVE_COLOR = 'hsl(var(--primary))';
const INACTIVE_COLOR = 'hsl(var(--muted-foreground))';

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
        background: 'hsl(var(--card) / 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid hsl(var(--border))',
      }}
    >
      {/* Button row — 49pt content height (HIG spec) */}
      <div
        className="flex items-stretch justify-around"
        style={{ height: '49px' }}
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
      <div style={{ height: 'max(env(safe-area-inset-bottom), 20px)' }} />
    </nav>
  );
});
