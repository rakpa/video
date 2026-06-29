import { Router } from 'express';
import Stripe from 'stripe';
import { config } from '../config.js';
import { readJsonBody } from '../utils/body.js';
import { isAdminEmail, signLicense, type PaidPlan, type Plan } from '../services/license.js';
import { lookupProEntitlement, planFromStripeSubscription } from '../services/stripeRestore.js';
import { logger } from '../utils/logger.js';

export const billingRouter = Router();

let stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!config.stripeSecret) return null;
  if (!stripe) stripe = new Stripe(config.stripeSecret);
  return stripe;
}

const CHECKOUT_PLANS: Record<
  PaidPlan,
  { cents: number; name: string; description: string; label: string }
> = {
  hd: {
    cents: config.priceHdYearlyCents,
    label: 'HD',
    name: 'VidCliply HD — Yearly',
    description: 'Unlocks 1080p Full HD downloads with sound for one year.',
  },
  '2k': {
    cents: config.price2kYearlyCents,
    label: '2K',
    name: 'VidCliply 2K — Yearly',
    description: 'Unlocks up to 2K (1440p) downloads with sound for one year.',
  },
  '4k': {
    cents: config.price4kYearlyCents,
    label: '4K',
    name: 'VidCliply 4K — Yearly',
    description: 'Unlocks up to 4K (2160p) downloads with sound for one year.',
  },
};

function isPaidPlan(plan: string): plan is PaidPlan {
  return plan === 'hd' || plan === '2k' || plan === '4k';
}

/** GET /api/billing/config → public pricing info for the pricing page. */
billingRouter.get('/billing/config', (_req, res) => {
  res.json({
    enabled: Boolean(config.stripeSecret),
    publishableKey: config.stripePublishableKey || null,
    plans: {
      hd: { cents: config.priceHdYearlyCents, label: 'HD', interval: 'year', maxHeight: 1080 },
      '2k': { cents: config.price2kYearlyCents, label: '2K', interval: 'year', maxHeight: 1440 },
      '4k': { cents: config.price4kYearlyCents, label: '4K', interval: 'year', maxHeight: 2160 },
    },
    freeMaxHeight: config.freeMaxHeight,
  });
});

/** POST /api/billing/checkout { plan } → { url } Stripe Checkout URL. */
billingRouter.post('/billing/checkout', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Payments are not configured yet.' });

  const plan = String(readJsonBody(req).plan ?? '');
  if (!isPaidPlan(plan)) {
    return res.status(400).json({ error: 'Please choose a valid plan (hd, 2k, or 4k).' });
  }

  const catalog = CHECKOUT_PLANS[plan];

  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      metadata: { vidcliply_plan: plan },
      subscription_data: { metadata: { vidcliply_plan: plan } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: catalog.cents,
            recurring: { interval: 'year' },
            product_data: {
              name: catalog.name,
              description: catalog.description,
            },
          },
        },
      ],
      allow_promotion_codes: true,
      success_url: `${config.siteUrl}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.siteUrl}/pricing?status=cancel`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    logger.error('Stripe checkout error:', (err as Error).message);
    return res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
});

/**
 * POST /api/billing/restore { email } → { token, email, plan, expiresAt }
 * Re-issues a Pro license for returning customers (new device, signed out, etc.).
 */
billingRouter.post('/billing/restore', async (req, res) => {
  const email = String(readJsonBody(req).email ?? '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Please enter the email you used at checkout.' });

  if (isAdminEmail(email)) {
    const exp = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const token = signLicense({ email, plan: '4k', exp });
    return res.json({ token, email, plan: '4k', expiresAt: exp, maxHeight: 2160 });
  }

  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Payments are not configured yet.' });

  try {
    const entitlement = await lookupProEntitlement(s, email);
    if (!entitlement) {
      return res.status(404).json({
        error: 'No active purchase found for that email. Use the same address from your Stripe receipt.',
      });
    }

    const token = signLicense({ email: entitlement.email, plan: entitlement.plan, exp: entitlement.exp });
    return res.json({
      token,
      email: entitlement.email,
      plan: entitlement.plan,
      expiresAt: entitlement.exp,
    });
  } catch (err) {
    logger.error('Stripe restore error:', (err as Error).message);
    return res.status(502).json({ error: 'Could not restore your Pro access. Please try again.' });
  }
});

/**
 * POST /api/billing/redeem { session_id } → { token, email, plan, expiresAt }
 * Called after Stripe redirects back. Confirms the session is paid and mints a
 * signed Pro license the client stores locally.
 */
billingRouter.post('/billing/redeem', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Payments are not configured yet.' });

  const sessionId = String(readJsonBody(req).session_id ?? '');
  if (!sessionId) return res.status(400).json({ error: 'Missing session.' });

  try {
    const session = await s.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed.' });
    }

    const email = (session.customer_details?.email ?? session.customer_email ?? 'unknown').toLowerCase();

    if (isAdminEmail(email)) {
      const exp = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const token = signLicense({ email, plan: '4k', exp });
      return res.json({ token, email, plan: '4k', expiresAt: exp });
    }

    let plan: Plan = '4k';
    let exp: number | null = null;

    if (session.mode === 'subscription' && session.subscription) {
      const sub = await s.subscriptions.retrieve(String(session.subscription));
      plan = planFromStripeSubscription(sub);
      exp = sub.current_period_end * 1000;
    } else if (session.mode === 'payment') {
      plan = '4k';
    }

    const token = signLicense({ email, plan, exp });
    return res.json({ token, email, plan, expiresAt: exp });
  } catch (err) {
    logger.error('Stripe redeem error:', (err as Error).message);
    return res.status(502).json({ error: 'Could not verify your payment.' });
  }
});

/**
 * POST /api/billing/webhook — verifies Stripe signature. Mounted with a raw
 * body parser in index.ts. Kept minimal here; extend to revoke on cancellation.
 */
export function handleWebhook(rawBody: Buffer, signature: string): { ok: boolean } {
  const s = getStripe();
  if (!s || !config.stripeWebhookSecret) return { ok: false };
  try {
    const event = s.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    logger.info(`Stripe webhook: ${event.type}`);
    return { ok: true };
  } catch (err) {
    logger.warn('Stripe webhook signature failed:', (err as Error).message);
    return { ok: false };
  }
}
