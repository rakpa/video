/** Session cache so the 2K/4K limit banner can show instantly (no cold-start wait). */
const KEY = 'vidcliply_highres_quota';

export interface CachedHighResQuota {
  used: number;
  limit: number;
  updatedAt: number;
}

export function readHighResQuotaCache(): CachedHighResQuota | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHighResQuota;
    if (typeof parsed.used !== 'number' || typeof parsed.limit !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHighResQuotaCache(used: number, limit: number): void {
  try {
    const payload: CachedHighResQuota = { used, limit, updatedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private browsing / quota exceeded */
  }
}

export function isHighResCacheExhausted(): boolean {
  const c = readHighResQuotaCache();
  return c != null && c.used >= c.limit;
}

/** Call after the server accepts a 2K/4K download job (HTTP 202). */
export function bumpHighResQuotaCache(): void {
  const c = readHighResQuotaCache();
  const limit = c?.limit ?? 5;
  const used = (c?.used ?? 0) + 1;
  writeHighResQuotaCache(used, limit);
}

export function markHighResCacheExhausted(limit = 5): void {
  writeHighResQuotaCache(limit, limit);
}
