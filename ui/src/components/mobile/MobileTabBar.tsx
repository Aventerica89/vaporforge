import { memo } from 'react';
import {
  MessageSquare,
  FolderTree,
  Terminal,
  MoreHorizontal,
  Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      className={cn(
        'flex flex-col glass-bar border-t border-border/50',
        'transition-transform duration-300 ease-out',
        keyboardOpen && 'translate-y-full',
      )}
    >
      {/* Button row — 49pt content height (HIG spec) */}
      <div className="flex h-[49px] items-stretch justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              title={tab.label}
              className={cn(
                'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5',
                'transition-[color,transform] duration-150 ease-out active:scale-90',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
              onClick={() => handleTabPress(tab.id)}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer — background extends behind home indicator */}
      <div style={{ height: 'max(env(safe-area-inset-bottom), 20px)' }} />
    </nav>
  );
});
