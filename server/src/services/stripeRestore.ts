import type Stripe from 'stripe';
import type { Plan } from './license.js';

export interface ProEntitlement {
  email: string;
  plan: Plan;
  exp: number | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SESSION_PAGES = 5;

function activeSubEntitlement(email: string, sub: Stripe.Subscription): ProEntitlement | null {
  if (sub.status !== 'active' && sub.status !== 'trialing') return null;
  return { email, plan: 'monthly', exp: sub.current_period_end * 1000 };
}

function sessionEmail(session: Stripe.Checkout.Session): string | null {
  return session.customer_details?.email?.trim().toLowerCase() ?? session.customer_email?.trim().toLowerCase() ?? null;
}

async function entitlementFromSession(
  stripe: Stripe,
  email: string,
  session: Stripe.Checkout.Session,
): Promise<ProEntitlement | null> {
  if (session.payment_status !== 'paid') return null;

  if (session.mode === 'subscription' && session.subscription) {
    const sub = await stripe.subscriptions.retrieve(String(session.subscription));
    return activeSubEntitlement(email, sub);
  }

  if (session.mode === 'payment') {
    return { email, plan: 'lifetime', exp: null };
  }

  return null;
}

/** Scans recent Checkout sessions when no Stripe Customer exists for the email. */
async function lookupViaCheckoutSessions(stripe: Stripe, email: string): Promise<ProEntitlement | null> {
  let lifetime: ProEntitlement | null = null;
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_SESSION_PAGES; page++) {
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (sessions.data.length === 0) break;

    for (const session of sessions.data) {
      if (sessionEmail(session) !== email) continue;
      const entitlement = await entitlementFromSession(stripe, email, session);
      if (!entitlement) continue;
      if (entitlement.plan === 'monthly') return entitlement;
      lifetime = entitlement;
    }

    if (lifetime) return lifetime;
    if (!sessions.has_more) break;
    startingAfter = sessions.data[sessions.data.length - 1]?.id;
  }

  return lifetime;
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
      const entitlement = await entitlementFromSession(stripe, email, session);
      if (!entitlement) continue;
      if (entitlement.plan === 'monthly') return entitlement;
      lifetime = entitlement;
    }
  }

  if (lifetime) return lifetime;
  return lookupViaCheckoutSessions(stripe, email);
}
