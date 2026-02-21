import { useState, useEffect } from 'react';
import {
  CreditCard,
  Zap,
  CheckCircle,
  ExternalLink,
  Loader2,
  Receipt,
  Download,
} from 'lucide-react';
import { billingApi } from '@/lib/api';

interface BillingStatus {
  plan: 'free' | 'pro';
  status: string;
  currentPeriodEnd?: string;
}

interface Invoice {
  id: string;
  date: number;
  amount: number;
  currency: string;
  status: string | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'unknown';
  const styles: Record<string, string> = {
    paid: 'bg-green-500/10 text-green-400 border-green-500/30',
    open: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    void: 'bg-muted text-muted-foreground border-border',
    uncollectible: 'bg-red-500/10 text-red-400 border-red-500/30',
    draft: 'bg-muted text-muted-foreground border-border',
    unknown: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[s] ?? styles.unknown}`}
    >
      {s}
    </span>
  );
}

export function BillingTab() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    billingApi
      .status()
      .then((res) => {
        if (res.success && res.data) {
          setStatus(res.data);
          // Fetch invoices if user has/had a subscription
          if (res.data.plan === 'pro' || res.data.status !== 'none') {
            setInvoicesLoading(true);
            billingApi
              .invoices()
              .then((inv) => {
                if (inv.success && inv.data) setInvoices(inv.data.invoices);
              })
              .catch(() => {})
              .finally(() => setInvoicesLoading(false));
          }
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
  const hasHistory = status?.status !== 'none';

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
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border ${
                  isPro
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {isPro ? 'Active' : 'Free'}
              </span>
            </div>

            {isPro && periodEnd && (
              <p className="text-xs text-muted-foreground">Renews {periodEnd}</p>
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

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {!isPro && (
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

            {/* Portal: always visible if user has/had a subscription */}
            {(isPro || hasHistory) && (
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
                {actionLoading === 'portal' ? 'Opening portal...' : 'Billing Portal'}
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Invoice history */}
          {(invoicesLoading || invoices.length > 0) && (
            <section className="space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" />
                Payment History
              </h4>

              {invoicesLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading invoices...
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span>Date</span>
                    <span className="text-right">Amount</span>
                    <span>Status</span>
                    <span className="sr-only">Actions</span>
                  </div>

                  {/* Invoice rows */}
                  {invoices.map((inv, i) => (
                    <div
                      key={inv.id}
                      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm ${
                        i < invoices.length - 1 ? 'border-b border-border/60' : ''
                      }`}
                    >
                      <span className="text-foreground tabular-nums">
                        {formatDate(inv.date)}
                      </span>
                      <span className="text-right font-mono text-foreground tabular-nums">
                        {formatAmount(inv.amount, inv.currency)}
                      </span>
                      <StatusBadge status={inv.status} />
                      <div className="flex items-center gap-1">
                        {inv.hostedUrl && (
                          <a
                            href={inv.hostedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                            title="View invoice"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
