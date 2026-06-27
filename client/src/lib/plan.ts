export type PlanId = 'yearly' | 'monthly' | 'lifetime';

export function planLabel(plan: PlanId | string): string {
  if (plan === 'yearly') return 'Yearly';
  if (plan === 'monthly') return 'Monthly';
  if (plan === 'lifetime') return 'Lifetime';
  return 'Pro';
}

export function planAccessLabel(plan: PlanId | string, expiresAt: number | null): string {
  if (plan === 'lifetime') return 'lifetime access';
  if (expiresAt) return `renews ${new Date(expiresAt).toLocaleDateString()}`;
  return 'active';
}
