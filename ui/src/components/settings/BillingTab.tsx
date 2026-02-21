import { useState, useEffect } from 'react';
import { CreditCard, Zap, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { billingApi } from '@/lib/api';

interface BillingStatus {
  plan: 'free' | 'pro';
  status: string;
  currentPeriodEnd?: string;
}

export function BillingTab() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    billingApi
      .status()
      .then((res) => {
        if (res.success && res.data) {
          setStatus(res.data);
        }
      })
      .catch(() => setError('Failed to load billing info'))
      .finally(() => setLoading(false));
  }, []);

  const handleCheckout = async () => {
    setActionLoading('checkout');
    setError('');
    try {
      const res = await billingApi.checkout();
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading('portal');
    setError('');
    try {
      const res = await billingApi.portal();
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing portal');
    } finally {
      setActionLoading(null);
    }
  };

  const isPro = status?.plan === 'pro' && status?.status === 'active';

  const periodEnd = status?.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <CreditCard className="h-4 w-4 text-primary" />
          Billing
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage your VaporForge subscription.
        </p>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading billing info...
        </div>
      ) : (
        <>
          {/* Current plan card */}
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPro ? (
                  <Zap className="h-4 w-4 text-primary" />
                ) : (
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {isPro ? 'Pro Plan' : 'Free Plan'}
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  isPro
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {isPro ? 'Active' : 'Free'}
              </span>
            </div>

            {isPro && periodEnd && (
              <p className="text-xs text-muted-foreground">
                Renews {periodEnd}
              </p>
            )}

            {!isPro && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-muted-foreground font-medium">Pro includes:</p>
                {[
                  'Dedicated sandbox container (2 vCPU, 12 GiB)',
                  'Persistent file storage (R2)',
                  'Full MCP server support',
                  'Agency visual editor',
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action button */}
          {isPro ? (
            <button
              onClick={handlePortal}
              disabled={actionLoading === 'portal'}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {actionLoading === 'portal' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {actionLoading === 'portal' ? 'Opening portal...' : 'Manage Subscription'}
            </button>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={actionLoading === 'checkout'}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {actionLoading === 'checkout' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {actionLoading === 'checkout' ? 'Redirecting...' : 'Upgrade to Pro — $20/mo'}
            </button>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
