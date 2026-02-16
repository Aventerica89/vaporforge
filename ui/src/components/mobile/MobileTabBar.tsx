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

  const baseClasses = [
    'flex',
    'flex-col',
    'bg-card/95',
    'backdrop-blur-md',
    'border-t',
    'border-border',
    'transition-transform',
    'duration-200',
  ];

  const hideClass = keyboardOpen ? 'translate-y-full' : '';
  const className = [...baseClasses, hideClass].filter(Boolean).join(' ');

  return (
    <nav
      role="tablist"
      className={className}
    >
      {/* Button row — sits above safe area */}
      <div className="flex items-center justify-around" style={{ minHeight: '49px' }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          const tabClasses = [
            'flex',
            'flex-col',
            'items-center',
            'justify-center',
            'flex-1',
            'py-1.5',
            'gap-0.5',
            isActive ? 'text-primary' : 'text-muted-foreground',
          ].join(' ');

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              className={tabClasses}
              onClick={() => handleTabPress(tab.id)}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer — background extends behind home indicator */}
      <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  );
});
