import type { Request } from 'express';

/**
 * Cloudflare/host proxies can occasionally deliver JSON bodies as a raw string.
 * Our routes expect an object, so normalize here to avoid runtime throws.
 */
export function readJsonBody(req: Request): { [key: string]: any } {
  const body = (req as unknown as { body?: unknown }).body;
  if (!body) return {};
  if (typeof body === 'object') return body as { [key: string]: any };
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as { [key: string]: any }) : {};
    } catch {
      return {};
    }
  }
  return {};
}

