import { User, LogOut, Shield, Clock } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export function AccountTab() {
  const { user, logout } = useAuthStore();

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <User className="h-4 w-4 text-primary" />
          Account
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage your session and authentication.
        </p>
      </section>

      {/* Profile card */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            U
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {user?.email || 'Claude User'}
            </p>
            <p className="text-xs text-muted-foreground">
              Authenticated via setup-token
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span>Session active</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Token refreshed automatically</span>
          </div>
        </div>
      </div>

      {/* Auth method explainer */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">
          Authentication
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          VaporForge authenticates using your Claude Pro/Max subscription via
          the <code className="text-primary">setup-token</code> flow. Your
          token is stored securely per-user and refreshed server-side.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          To re-authenticate, sign out and run{' '}
          <code className="text-primary">claude setup-token</code>{' '}
          in your local terminal.
        </p>
      </div>

      {/* Sign out */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:border-red-500/50"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          This will clear your session token and return to the login screen.
        </p>
      </div>
    </div>
  );
}
