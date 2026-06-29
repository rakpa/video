export type PlanId = 'hd' | '2k' | '4k' | 'yearly' | 'monthly' | 'lifetime';

const ADMIN_EMAILS = ['rakpa8@gmail.com'];

export function planLabel(plan: PlanId | string): string {
  if (plan === 'hd') return 'HD';
  if (plan === '2k') return '2K';
  if (plan === '4k') return '4K';
  if (plan === 'yearly') return '4K';
  if (plan === 'monthly') return '2K';
  if (plan === 'lifetime') return 'Lifetime';
  return 'Pro';
}

export function maxHeightForPlan(plan: PlanId | string): number {
  if (plan === 'hd') return 1080;
  if (plan === '2k' || plan === 'monthly') return 1440;
  if (plan === '4k' || plan === 'yearly' || plan === 'lifetime') return 2160;
  return 720;
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

/** Plan needed to unlock a given video height. */
export function planForHeight(height: number): PaidPlanId {
  if (height <= 720) return 'free';
  if (height <= 1080) return 'hd';
  if (height <= 1440) return '2k';
  return '4k';
}

export type PaidPlanId = 'free' | 'hd' | '2k' | '4k';

export function paidPlanLabel(plan: PaidPlanId): string {
  if (plan === 'hd') return 'HD';
  if (plan === '2k') return '2K';
  if (plan === '4k') return '4K';
  return 'Free';
}

/** Stripe checkout tier for a quality label like "1080p" or "2160p". */
export function checkoutPlanForLabel(label?: string): 'hd' | '2k' | '4k' {
  const h = parseInt(label ?? '', 10);
  if (!Number.isFinite(h) || h <= 1080) return 'hd';
  if (h <= 1440) return '2k';
  return '4k';
}
