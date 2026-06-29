import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Stateless Pro entitlement. A license is a small JSON payload signed with an
 * HMAC so the server can verify it without a database.
 */
export type Plan = 'hd' | '2k' | '4k' | 'yearly' | 'monthly' | 'lifetime';

export type PaidPlan = 'hd' | '2k' | '4k';

export interface License {
  email: string;
  plan: Plan;
  /** Unix ms expiry; null = never expires (legacy lifetime). */
  exp: number | null;
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', config.licenseSecret).update(payloadB64).digest('hex');
}

/** Produces a signed `<payload>.<signature>` token. */
export function signLicense(license: License): string {
  const payloadB64 = b64url(JSON.stringify(license));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verifies signature + expiry; returns the license or null. */
export function verifyLicense(token: string | undefined | null): License | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    const license = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as License;
    if (license.exp != null && Date.now() > license.exp) return null;
    return license;
  } catch {
    return null;
  }
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return config.adminEmails.includes(email.trim().toLowerCase());
}

export const FREE_TIER_MAX_HEIGHT = 720;

/** Max video height (px) unlocked by a paid plan. Only admin + 4k plan get full 4K. */
export function maxHeightForPlan(plan: Plan | string): number {
  if (plan === 'hd') return 1080;
  if (plan === '2k' || plan === 'monthly') return 1440;
  if (plan === '4k') return 2160;
  // Legacy plans from the old single-tier checkout — cap at 2K, not 4K.
  if (plan === 'yearly' || plan === 'lifetime') return 1440;
  return FREE_TIER_MAX_HEIGHT;
}

/** Highest height the caller may download for the given license token. */
export function maxAllowedHeight(token: string | undefined | null): number {
  const license = verifyLicense(token);
  if (!license) return FREE_TIER_MAX_HEIGHT;
  if (isAdminEmail(license.email)) return 2160;
  return maxHeightForPlan(license.plan);
}

/** True if the token grants any paid plan (non-admin). */
export function isPro(token: string | undefined | null): boolean {
  return verifyLicense(token) !== null;
}

export function tierRank(plan: Plan): number {
  if (plan === 'lifetime') return 100;
  if (plan === '4k') return 40;
  if (plan === '2k' || plan === 'monthly' || plan === 'yearly') return 30;
  if (plan === 'hd') return 20;
  return 0;
}
