/**
 * Client-side Pro license storage. The signed token comes from the backend
 * after a successful Stripe checkout and is sent with premium download requests.
 */
import { isAdminEmail, maxHeightForPlan, type PlanId, FREE_TIER_MAX_HEIGHT } from './plan';

export { FREE_TIER_MAX_HEIGHT };

export interface StoredLicense {
  token: string;
  email: string;
  plan: PlanId;
  expiresAt: number | null;
}

const KEY = 'clipvault-license';

export function getLicense(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const lic = JSON.parse(raw) as StoredLicense;
    if (lic.expiresAt != null && Date.now() > lic.expiresAt) {
      clearLicense();
      return null;
    }
    return lic;
  } catch {
    return null;
  }
}

export function setLicense(lic: StoredLicense): void {
  localStorage.setItem(KEY, JSON.stringify(lic));
}

export function clearLicense(): void {
  localStorage.removeItem(KEY);
}

/** Max video height the user may download (px). Without a license: 1080p HD only. */
export function maxAllowedHeight(): number {
  const lic = getLicense();
  if (!lic) return FREE_TIER_MAX_HEIGHT;
  if (isAdminEmail(lic.email)) return 2160;
  return maxHeightForPlan(lic.plan);
}

/** True when the user currently holds any paid license. */
export function isPro(): boolean {
  return getLicense() !== null;
}

/** The token to attach to premium download requests (or undefined). */
export function licenseToken(): string | undefined {
  return getLicense()?.token;
}
