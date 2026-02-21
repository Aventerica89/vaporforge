import { Hono } from 'hono';
import Stripe from 'stripe';
import type { User } from '../types';

type Variables = { user: User };

export const billingRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// KV key helpers
function subscriptionKey(userId: string): string {
  return `subscription:${userId}`;
}

function customerKey(stripeCustomerId: string): string {
  return `customer:${stripeCustomerId}`;
}

interface SubscriptionRecord {
  plan: 'free' | 'pro';
  status: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: string;
}

function getStripe(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: '2026-01-28.clover',
  });
}

/** Get current_period_end from a subscription (moved to items in 2026-01-28.clover) */
function getPeriodEnd(sub: Stripe.Subscription): number {
  return sub.items.data[0]?.current_period_end ?? 0;
}

async function getSubscription(
  kv: KVNamespace,
  userId: string
): Promise<SubscriptionRecord | null> {
  const raw = await kv.get(subscriptionKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubscriptionRecord;
  } catch {
    return null;
  }
}

// GET /api/billing/status
billingRoutes.get('/status', async (c) => {
  const user = c.get('user');
  const sub = await getSubscription(c.env.AUTH_KV, user.id);

  if (!sub) {
    return c.json({
      success: true,
      data: { plan: 'free', status: 'none' },
    });
  }

  return c.json({
    success: true,
    data: {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
  });
});

// POST /api/billing/checkout — create a Stripe Checkout Session
billingRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const stripe = getStripe(c.env);
  const origin = new URL(c.req.url).origin;

  // Reuse existing customer id if the user already subscribed before
  const existing = await getSubscription(c.env.AUTH_KV, user.id);
  const customerOptions: Stripe.Checkout.SessionCreateParams = existing?.stripeCustomerId
    ? { customer: existing.stripeCustomerId }
    : { customer_email: user.email ?? undefined };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: c.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    ...customerOptions,
    success_url: `${origin}/app/?billing=success`,
    cancel_url: `${origin}/app/?billing=cancel`,
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
  });

  return c.json({ success: true, data: { url: session.url } });
});

// GET /api/billing/invoices — last 12 invoices for the current user
billingRoutes.get('/invoices', async (c) => {
  const user = c.get('user');
  const sub = await getSubscription(c.env.AUTH_KV, user.id);

  if (!sub?.stripeCustomerId) {
    return c.json({ success: true, data: { invoices: [] } });
  }

  const stripe = getStripe(c.env);
  const list = await stripe.invoices.list({
    customer: sub.stripeCustomerId,
    limit: 12,
  });

  const invoices = list.data.map((inv) => ({
    id: inv.id,
    date: inv.created,
    amount: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    pdfUrl: inv.invoice_pdf,
    hostedUrl: inv.hosted_invoice_url,
  }));

  return c.json({ success: true, data: { invoices } });
});

// POST /api/billing/portal — create a Stripe Customer Portal session
billingRoutes.post('/portal', async (c) => {
  const user = c.get('user');
  const sub = await getSubscription(c.env.AUTH_KV, user.id);

  if (!sub?.stripeCustomerId) {
    return c.json(
      { success: false, error: 'No active subscription found' },
      400
    );
  }

  const stripe = getStripe(c.env);
  const origin = new URL(c.req.url).origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/app/?billing=portal`,
  });

  return c.json({ success: true, data: { url: session.url } });
});

// ─── Usage Alerts ────────────────────────────────────────────────────────────

export interface AlertConfig {
  id: string;
  label: string;
  thresholdPct: number; // 0-100
  enabled: boolean;
  channels: Array<'in-app'>;
  triggeredAt: string | null;
  triggeredCount: number;
  createdAt: string;
}

function alertsKey(userId: string): string {
  return `billing-alerts:${userId}`;
}

async function getAlerts(kv: KVNamespace, userId: string): Promise<AlertConfig[]> {
  const raw = await kv.get(alertsKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AlertConfig[];
  } catch {
    return [];
  }
}

async function saveAlerts(kv: KVNamespace, userId: string, alerts: AlertConfig[]): Promise<void> {
  await kv.put(alertsKey(userId), JSON.stringify(alerts));
}

// GET /api/billing/alerts
billingRoutes.get('/alerts', async (c) => {
  const user = c.get('user');
  const alerts = await getAlerts(c.env.AUTH_KV, user.id);
  return c.json({ success: true, data: { alerts } });
});

// POST /api/billing/alerts
billingRoutes.post('/alerts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ label?: string; thresholdPct: number; channels?: Array<'in-app'> }>();

  if (typeof body.thresholdPct !== 'number' || body.thresholdPct < 1 || body.thresholdPct > 99) {
    return c.json({ success: false, error: 'thresholdPct must be between 1 and 99' }, 400);
  }

  const alerts = await getAlerts(c.env.AUTH_KV, user.id);
  const newAlert: AlertConfig = {
    id: crypto.randomUUID(),
    label: body.label?.trim() || `Alert at ${body.thresholdPct}%`,
    thresholdPct: body.thresholdPct,
    enabled: true,
    channels: body.channels ?? ['in-app'],
    triggeredAt: null,
    triggeredCount: 0,
    createdAt: new Date().toISOString(),
  };

  alerts.push(newAlert);
  await saveAlerts(c.env.AUTH_KV, user.id, alerts);
  return c.json({ success: true, data: { alert: newAlert } });
});

// PATCH /api/billing/alerts/:id/toggle
billingRoutes.patch('/alerts/:id/toggle', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const alerts = await getAlerts(c.env.AUTH_KV, user.id);
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx === -1) return c.json({ success: false, error: 'Alert not found' }, 404);

  alerts[idx] = { ...alerts[idx], enabled: !alerts[idx].enabled };
  await saveAlerts(c.env.AUTH_KV, user.id, alerts);
  return c.json({ success: true, data: { alert: alerts[idx] } });
});

// DELETE /api/billing/alerts/:id
billingRoutes.delete('/alerts/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const alerts = await getAlerts(c.env.AUTH_KV, user.id);
  const filtered = alerts.filter((a) => a.id !== id);
  if (filtered.length === alerts.length) {
    return c.json({ success: false, error: 'Alert not found' }, 404);
  }
  await saveAlerts(c.env.AUTH_KV, user.id, filtered);
  return c.json({ success: true });
});

// Public webhook handler — registered directly on app (no JWT auth)
export async function handleBillingWebhook(c: { req: Request; env: Env }) {
  const stripe = getStripe(c.env);
  const sig = (c.req as Request).headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await (c.req as Request).text();
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook verification failed';
    return new Response(msg, { status: 400 });
  }

  try {
    await handleStripeEvent(event, c.env);
  } catch (err) {
    console.error('[billing webhook] handler error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}

async function handleStripeEvent(event: Stripe.Event, env: Env): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId || !session.customer || !session.subscription) break;

      const customerId = String(session.customer);
      const subscriptionId = String(session.subscription);

      // Fetch full subscription to get period end
      const stripe = getStripe(env);
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

      const record: SubscriptionRecord = {
        plan: 'pro',
        status: stripeSubscription.status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd: new Date(
          getPeriodEnd(stripeSubscription) * 1000
        ).toISOString(),
      };

      await env.AUTH_KV.put(subscriptionKey(userId), JSON.stringify(record));
      await env.AUTH_KV.put(customerKey(customerId), userId);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = String(sub.customer);
      const userId = await env.AUTH_KV.get(customerKey(customerId));
      if (!userId) break;

      const existing = await getSubscription(env.AUTH_KV, userId);
      if (!existing) break;

      const updated: SubscriptionRecord = {
        ...existing,
        status: sub.status,
        currentPeriodEnd: new Date(getPeriodEnd(sub) * 1000).toISOString(),
        plan: sub.status === 'active' ? 'pro' : 'free',
      };

      await env.AUTH_KV.put(subscriptionKey(userId), JSON.stringify(updated));
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = String(sub.customer);
      const userId = await env.AUTH_KV.get(customerKey(customerId));
      if (!userId) break;

      const existing = await getSubscription(env.AUTH_KV, userId);
      if (!existing) break;

      const downgraded: SubscriptionRecord = {
        ...existing,
        plan: 'free',
        status: 'canceled',
      };

      await env.AUTH_KV.put(subscriptionKey(userId), JSON.stringify(downgraded));
      break;
    }

    default:
      break;
  }
}
