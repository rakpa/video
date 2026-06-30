export type PlanId = 'pro' | 'hd' | '2k' | '4k' | 'yearly' | 'monthly' | 'lifetime';



export const FREE_TIER_MAX_HEIGHT = 1080;



const ADMIN_EMAILS = ['rakpa8@gmail.com'];



export function planLabel(plan: PlanId | string): string {

  if (plan === 'pro') return 'Pro';

  if (plan === 'hd') return 'HD';

  if (plan === '2k') return '2K';

  if (plan === '4k') return '4K';

  if (plan === 'yearly') return 'Pro';

  if (plan === 'monthly') return 'Pro';

  if (plan === 'lifetime') return 'Lifetime';

  return 'Pro';

}



export function maxHeightForPlan(plan: PlanId | string): number {

  if (plan === 'hd') return 1080;

  if (plan === 'pro' || plan === '2k' || plan === '4k' || plan === 'yearly' || plan === 'monthly' || plan === 'lifetime') {

    return 2160;

  }

  return FREE_TIER_MAX_HEIGHT;

}



export function isAdminEmail(email: string | undefined | null): boolean {

  if (!email) return false;

  return ADMIN_EMAILS.includes(email.trim().toLowerCase());

}



export function planAccessLabel(plan: PlanId | string, expiresAt: number | null): string {

  if (plan === 'lifetime') return 'lifetime access';

  if (expiresAt) return `renews ${new Date(expiresAt).toLocaleDateString()}`;

  return 'active';

}



export type PaidPlanId = 'free' | 'pro';



export function paidPlanLabel(plan: PaidPlanId): string {

  if (plan === 'pro') return 'Pro';

  return 'Free';

}



/** Stripe checkout plan — Pro unlocks 2K & 4K above the free HD tier. */

export function checkoutPlanForLabel(_label?: string): 'pro' {

  return 'pro';

}


