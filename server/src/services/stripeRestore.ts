import type Stripe from 'stripe';
import type { Plan } from './license.js';

export interface ProEntitlement {
  email: string;
  plan: Plan;
  exp: number | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeStripeSearch(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function searchCheckoutByEmail(stripe: Stripe, email: string): Promise<Stripe.Checkout.Session[]> {
  const search = (
    stripe.checkout.sessions as {
      search?: (params: { query: string; limit?: number }) => Promise<{ data: Stripe.Checkout.Session[] }>;
    }
  ).search;
  if (!search) return [];
  const result = await search.call(stripe.checkout.sessions, {
    query: `status:'complete' AND customer_details.email:'${escapeStripeSearch(email)}'`,
    limit: 20,
  });
  return result.data;
}

function activeSubEntitlement(email: string, sub: Stripe.Subscription): ProEntitlement | null {
  if (sub.status !== 'active' && sub.status !== 'trialing') return null;
  return { email, plan: 'monthly', exp: sub.current_period_end * 1000 };
}

/** Looks up an active Pro purchase in Stripe for the given checkout email. */
export async function lookupProEntitlement(stripe: Stripe, rawEmail: string): Promise<ProEntitlement | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;

  const customers = await stripe.customers.list({ email, limit: 10 });
  let lifetime: ProEntitlement | null = null;

  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
    const active = subs.data
      .map((sub) => activeSubEntitlement(email, sub))
      .filter((e): e is ProEntitlement => e !== null)
      .sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0))[0];
    if (active) return active;

    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });
    for (const session of sessions.data) {
      if (session.payment_status !== 'paid') continue;
      if (session.mode === 'payment') {
        lifetime = { email, plan: 'lifetime', exp: null };
        break;
      }
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(String(session.subscription));
        const monthly = activeSubEntitlement(email, sub);
        if (monthly) return monthly;
      }
    }
  }

  const searched = await searchCheckoutByEmail(stripe, email);
  for (const session of searched) {
    if (session.payment_status !== 'paid') continue;
    if (session.mode === 'subscription' && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      const monthly = activeSubEntitlement(email, sub);
      if (monthly) return monthly;
    }
    if (session.mode === 'payment') {
      return { email, plan: 'lifetime', exp: null };
    }
  }

  return lifetime;
}
