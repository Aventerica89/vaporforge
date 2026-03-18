import {
  Settings,
  Plus,
  Bug,
} from 'lucide-react';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useIssueTracker } from '@/hooks/useIssueTracker';
import { haptics } from '@/lib/haptics';
import { MobileBottomSheet } from '@/components/MobileBottomSheet';
import type { SubView } from '@/hooks/useMobileNav';

type PromptMoreDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: SubView) => void;
};

type GridItem = {
  key: string;
  icon: React.ElementType;
  label: string;
  iconColor: string;
  onPress: () => void;
};

export function PromptMoreDrawer({ isOpen, onClose, onNavigate }: PromptMoreDrawerProps) {
  const createSession = useSandboxStore((s) => s.createSession);

  const navigateSubView = (view: SubView) => {
    haptics.light();
    onClose();
    onNavigate(view);
  };

  const handleNewSession = async () => {
    haptics.light();
    onClose();
    await createSession();
  };

  const handleBugTracker = () => {
    haptics.light();
    onClose();
    useIssueTracker.getState().openTracker();
  };

  const GRID_ITEMS: GridItem[] = [
    {
      key: 'new-session',
      icon: Plus,
      label: 'New Session',
      iconColor: 'text-primary',
      onPress: handleNewSession,
    },
    {
      key: 'settings',
      icon: Settings,
      label: 'Settings',
      iconColor: 'text-muted-foreground',
      onPress: () => navigateSubView('settings'),
    },
    {
      key: 'bugs',
      icon: Bug,
      label: 'Bug Tracker',
      iconColor: 'text-orange-400',
      onPress: handleBugTracker,
    },
  ];

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} title="More">
      <div className="grid grid-cols-3 gap-2 pb-2">
        {GRID_ITEMS.map(({ key, icon: Icon, label, iconColor, onPress }) => (
          <button
            key={key}
            type="button"
            onClick={onPress}
            className="flex flex-col items-center gap-2 rounded-xl p-4 min-h-[80px] transition-colors active:scale-[0.96] hover:bg-primary/10 active:bg-accent"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon className={`size-6 ${iconColor}`} strokeWidth={1.5} />
            <span className="text-xs font-medium text-foreground/80">{label}</span>
          </button>
        ))}
      </div>
    </MobileBottomSheet>
  );
}
