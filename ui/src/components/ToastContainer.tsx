import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { ToastType } from '@/hooks/useToast';

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'bg-green-500/10 border-green-500/20 text-green-400',
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.type];
        const styles = TOAST_STYLES[toast.type];

        return (
          <div
            key={toast.id}
            className={`glass-card pointer-events-auto flex items-start gap-3 border px-4 py-3 shadow-lg animate-slide-in-right ${styles}`}
            style={{ minWidth: '300px', maxWidth: '400px' }}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded p-0.5 hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
