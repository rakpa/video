/** Persists 2K/4K usage in localStorage so the limit banner shows instantly (no server wait). */
const KEY = 'vidcliply_highres_quota';
const DEFAULT_LIMIT = 5;

export interface CachedHighResQuota {
  used: number;
  limit: number;
  updatedAt: number;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readHighResQuotaCache(): CachedHighResQuota | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHighResQuota;
    if (typeof parsed.used !== 'number' || typeof parsed.limit !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHighResQuotaCache(used: number, limit: number): void {
  const store = storage();
  if (!store) return;
  try {
    const payload: CachedHighResQuota = { used, limit, updatedAt: Date.now() };
    store.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded / private mode */
  }
}

/** Merge server count with local — never under-count vs the server. */
export function mergeHighResQuotaCache(serverUsed: number, serverLimit: number): void {
  const local = getHighResUsed();
  const limit = serverLimit || getHighResLimit();
  writeHighResQuotaCache(Math.max(local, serverUsed), limit);
}

export function getHighResUsed(): number {
  return readHighResQuotaCache()?.used ?? 0;
}

export function getHighResLimit(): number {
  return readHighResQuotaCache()?.limit ?? DEFAULT_LIMIT;
}

export function isHighResCacheExhausted(): boolean {
  return getHighResUsed() >= getHighResLimit();
}

export function markHighResCacheExhausted(limit = DEFAULT_LIMIT): void {
  writeHighResQuotaCache(limit, limit);
}

/**
 * Synchronous pre-check before any network call.
 * Returns false when the visitor is already at/over the free 2K/4K allowance.
 */
export function canStartHighResDownload(): boolean {
  return getHighResUsed() < getHighResLimit();
}

/** Count one 4K/2K download attempt immediately on button click. */
export function recordHighResDownloadClick(): void {
  const used = getHighResUsed();
  const limit = getHighResLimit();
  writeHighResQuotaCache(used + 1, limit);
}
