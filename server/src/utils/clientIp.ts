import type { Request } from 'express';

/** Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4) so the same visitor always maps to one key. */
function normalizeIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const ip = raw.trim();
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/**
 * Best-effort client IP for per-IP rate limits.
 * Requires `app.set('trust proxy', true)` behind Railway/Vercel proxies.
 */
export function getClientIp(req: Request): string | undefined {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)
    ?.split(',')[0]
    ?.trim();
  const realIp = (req.headers['x-real-ip'] as string | undefined)?.trim();
  const cfIp = (req.headers['cf-connecting-ip'] as string | undefined)?.trim();
  return normalizeIp(forwarded || realIp || cfIp || req.socket.remoteAddress || undefined);
}
