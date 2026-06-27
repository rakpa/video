import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Stateless Pro entitlement. A license is a small JSON payload signed with an
 * HMAC so the server can verify it without a database. Good enough for a paid
 * unlock; swap for DB-backed sessions when you add real accounts.
 */
export type Plan = 'yearly' | 'monthly' | 'lifetime';

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
  // Constant-time compare to avoid timing leaks.
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

/** True if the token grants active Pro access. */
export function isPro(token: string | undefined | null): boolean {
  return verifyLicense(token) !== null;
}
