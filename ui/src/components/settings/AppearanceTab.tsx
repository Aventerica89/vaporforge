import { Sun, Moon, Palette } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function AppearanceTab() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Palette className="h-4 w-4 text-primary" />
          Appearance
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Customize the look and feel of VaporForge.
        </p>
      </section>

      {/* Theme toggle */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Theme</h4>
        <div className="flex gap-3">
          <ThemeCard
            label="Dark"
            icon={<Moon className="h-5 w-5" />}
            isActive={theme === 'dark'}
            onClick={() => theme !== 'dark' && toggleTheme()}
            previewBg="bg-[hsl(215,25%,8%)]"
            previewAccent="bg-[hsl(185,95%,55%)]"
          />
          <ThemeCard
            label="Light"
            icon={<Sun className="h-5 w-5" />}
            isActive={theme === 'light'}
            onClick={() => theme !== 'light' && toggleTheme()}
            previewBg="bg-white"
            previewAccent="bg-[hsl(185,95%,40%)]"
          />
        </div>
      </div>

      {/* Font info */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Typography</h4>
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Display font</span>
            <span className="font-display text-sm text-foreground">Orbitron</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Code font</span>
            <span className="font-mono text-sm text-foreground">Space Mono</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Editor zoom</span>
            <span className="text-sm text-muted-foreground/60">
              Pinch to zoom in editor/terminal
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  label,
  icon,
  isActive,
  onClick,
  previewBg,
  previewAccent,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  previewBg: string;
  previewAccent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border-2 p-3 transition-all ${
        isActive
          ? 'border-primary bg-primary/5 shadow-[0_0_12px_hsl(var(--primary)/0.15)]'
          : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      {/* Preview */}
      <div
        className={`${previewBg} mb-3 h-16 rounded-md border border-black/10 p-2 flex flex-col gap-1`}
      >
        <div className={`${previewAccent} h-1.5 w-8 rounded-full`} />
        <div className={`${previewAccent} h-1.5 w-12 rounded-full opacity-30`} />
        <div className={`${previewAccent} h-1.5 w-6 rounded-full opacity-15`} />
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
          {icon}
        </span>
        <span
          className={`text-sm font-medium ${
            isActive ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>
      </div>
    </button>
  );
}
