import { Terminal, MessageSquare, FileCode, FolderTree } from 'lucide-react';

export type MobileView = 'files' | 'editor' | 'terminal' | 'chat';

interface MobileNavigationProps {
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
}

export function MobileNavigation({ activeView, onViewChange }: MobileNavigationProps) {
  const navItems = [
    { id: 'files' as MobileView, icon: FolderTree, label: 'Files' },
    { id: 'editor' as MobileView, icon: FileCode, label: 'Editor' },
    { id: 'terminal' as MobileView, icon: Terminal, label: 'Terminal' },
    { id: 'chat' as MobileView, icon: MessageSquare, label: 'Chat' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border safe-bottom md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`
                flex flex-col items-center justify-center gap-1
                min-w-[56px] min-h-[44px] px-3 py-2
                transition-all duration-200
                animate-fade-up stagger-${index + 1}
                ${isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  size={22}
                  className={`transition-all duration-200 ${
                    isActive
                      ? 'scale-110 drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]'
                      : 'scale-100'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary animate-scale-in" />
                )}
              </div>
              <span
                className={`text-[10px] font-display font-bold uppercase tracking-wider ${
                  isActive ? 'opacity-100' : 'opacity-60'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Decorative accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
    </nav>
  );
}
