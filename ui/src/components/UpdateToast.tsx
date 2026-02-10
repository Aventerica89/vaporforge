import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';

export function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('vf:update-available', handler);
    return () => window.removeEventListener('vf:update-available', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 animate-fade-up">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-4 py-2.5 shadow-lg shadow-primary/10">
        <RefreshCw className="h-4 w-4 text-primary" />
        <span className="text-sm text-foreground">
          VaporForge updated
        </span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Refresh
        </button>
        <button
          onClick={() => setVisible(false)}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
