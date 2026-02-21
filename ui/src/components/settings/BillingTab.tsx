import { useState, useEffect } from 'react';
import { Zap, ExternalLink, Loader2, CreditCard } from 'lucide-react';
import { billingApi } from '@/lib/api';
import stripeLogo from '@/assets/logos/stripe-logo.svg';
import { InvoiceHistory, type InvoiceItem } from '@/components/billingsdk/invoice-history';
import { UpdatePlanCard } from '@/components/billingsdk/update-plan-card';
import type { Plan } from '@/lib/billingsdk-config';

interface BillingStatus {
  plan: 'free' | 'pro';
  status: string;
  currentPeriodEnd?: string;
}

interface StripeInvoice {
  id: string;
  date: number;
  amount: number;
  currency: string;
  status: string | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

// VaporForge plans for UpdatePlanCard
const VF_PLANS: Plan[] = [
  {
    id: 'free',
    title: 'Free',
    description: 'Claude access via your own Anthropic account.',
    currency: '$',
    monthlyPrice: '0',
    yearlyPrice: '0',
    buttonText: 'Current Plan',
    features: [
      { name: 'Claude via OAuth', icon: 'check' },
      { name: 'Shared sandbox', icon: 'check' },
      { name: 'Monaco editor + terminal', icon: 'check' },
    ],
  },
  {
    id: 'pro',
    title: 'Pro',
    description: 'Dedicated sandbox with persistent storage and full MCP support.',
    currency: '$',
    monthlyPrice: '20',
    yearlyPrice: '20',
    buttonText: 'Upgrade',
    badge: 'Recommended',
    features: [
      { name: 'Dedicated sandbox (2 vCPU, 12 GiB)', icon: 'check' },
      { name: 'Persistent file storage (R2)', icon: 'check' },
      { name: 'MCP server support', icon: 'check' },
      { name: 'Agency visual editor', icon: 'check' },
    ],
  },
];

function mapStatus(s: string | null): InvoiceItem['status'] {
  if (s === 'paid') return 'paid';
  if (s === 'open') return 'open';
  if (s === 'void') return 'void';
  return 'void';
}

function toInvoiceItems(invoices: StripeInvoice[]): InvoiceItem[] {
  return invoices.map((inv) => ({
    id: inv.id,
    date: new Date(inv.date * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    amount: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: inv.currency.toUpperCase(),
    }).format(inv.amount / 100),
    status: mapStatus(inv.status),
    invoiceUrl: inv.hostedUrl ?? undefined,
    description: 'VaporForge Pro',
  }));
}

export function BillingTab() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
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
  const hasHistory = status?.status !== 'none' && status?.status !== undefined;

  const periodEnd = status?.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <CreditCard className="h-4 w-4 text-primary" />
          Billing
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage your VaporForge subscription. Payments secured by{' '}
          <img src={stripeLogo} alt="Stripe" className="inline h-3.5 align-middle opacity-60" />.
        </p>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading billing info...
        </div>
      ) : (
        <>
          {/* Free users: plan upgrade card */}
          {!isPro && (
            <UpdatePlanCard
              currentPlan={VF_PLANS[0]}
              plans={VF_PLANS}
              onPlanChange={(planId) => {
                if (planId === 'pro') {
                  if (actionLoading === 'checkout') return;
                  handleCheckout();
                }
              }}
              title="Choose your plan"
              className="border-border bg-muted/20"
            />
          )}

          {/* Pro users: current plan status */}
          {isPro && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Pro Plan</span>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border bg-primary/10 text-primary border-primary/30">
                  Active
                </span>
              </div>
              {periodEnd && (
                <p className="text-xs text-muted-foreground">Renews {periodEnd}</p>
              )}
              <button
                onClick={handlePortal}
                disabled={actionLoading === 'portal'}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading === 'portal' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                {actionLoading === 'portal' ? 'Opening...' : 'Billing Portal'}
              </button>
            </div>
          )}

          {/* Portal button for ex-subscribers on free plan */}
          {!isPro && hasHistory && (
            <button
              onClick={handlePortal}
              disabled={actionLoading === 'portal'}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {actionLoading === 'portal' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              {actionLoading === 'portal' ? 'Opening...' : 'Billing Portal'}
            </button>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Invoice history */}
          {(invoicesLoading || invoices.length > 0 || hasHistory) && (
            <div>
              {invoicesLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading invoices...
                </div>
              ) : (
                <InvoiceHistory
                  invoices={toInvoiceItems(invoices)}
                  title="Payment History"
                  description="Your past invoices and receipts."
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
