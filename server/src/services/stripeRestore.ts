import type Stripe from 'stripe';

import { config } from '../config.js';

import { isAdminEmail, tierRank, type Plan } from './license.js';



export interface ProEntitlement {

  email: string;

  plan: Plan;

  exp: number | null;

}



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_SESSION_PAGES = 5;



export function planFromStripeSubscription(sub: Stripe.Subscription): Plan {

  const meta = sub.metadata?.vidcliply_plan;

  if (meta === 'pro') return 'pro';

  if (meta === 'hd' || meta === '2k' || meta === '4k') return meta;

  if (meta === 'yearly' || meta === 'monthly') return 'pro';

  if (meta === 'lifetime') return 'lifetime';



  const interval = sub.items.data[0]?.price?.recurring?.interval;

  if (interval === 'year' || interval === 'month') return 'pro';

  return 'pro';

}



function activeSubEntitlement(email: string, sub: Stripe.Subscription): ProEntitlement | null {

  if (sub.status !== 'active' && sub.status !== 'trialing') return null;

  return { email, plan: planFromStripeSubscription(sub), exp: sub.current_period_end * 1000 };

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

    return { email, plan: 'pro', exp: null };

  }



  return null;

}



function preferEntitlement(current: ProEntitlement | null, next: ProEntitlement): ProEntitlement {

  if (!current) return next;

  if (tierRank(next.plan) > tierRank(current.plan)) return next;

  if (tierRank(next.plan) < tierRank(current.plan)) return current;

  return (next.exp ?? 0) > (current.exp ?? 0) ? next : current;

}



/** Scans recent Checkout sessions when no Stripe Customer exists for the email. */

async function lookupViaCheckoutSessions(stripe: Stripe, email: string): Promise<ProEntitlement | null> {

  let best: ProEntitlement | null = null;

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

      best = preferEntitlement(best, entitlement);

      if (tierRank(best.plan) >= tierRank('pro')) return best;

    }



    if (!sessions.has_more) break;

    startingAfter = sessions.data[sessions.data.length - 1]?.id;

  }



  return best;

}



/** Looks up an active Pro purchase in Stripe for the given checkout email. */

export async function lookupProEntitlement(stripe: Stripe, rawEmail: string): Promise<ProEntitlement | null> {

  const email = rawEmail.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) return null;



  if (isAdminEmail(email)) {

    return { email, plan: 'pro', exp: Date.now() + 365 * 24 * 60 * 60 * 1000 };

  }



  const customers = await stripe.customers.list({ email, limit: 10 });

  let best: ProEntitlement | null = null;



  for (const customer of customers.data) {

    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });

    for (const sub of subs.data) {

      const entitlement = activeSubEntitlement(email, sub);

      if (entitlement) best = preferEntitlement(best, entitlement);

    }



    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });

    for (const session of sessions.data) {

      const entitlement = await entitlementFromSession(stripe, email, session);

      if (entitlement) best = preferEntitlement(best, entitlement);

    }

  }



  if (best && tierRank(best.plan) >= tierRank('pro')) return best;



  const fromSessions = await lookupViaCheckoutSessions(stripe, email);

  return fromSessions ? preferEntitlement(best, fromSessions) : best;

}


