import type { PlatformId } from '../types';

export interface PlatformMeta {
  id: PlatformId;
  label: string;
  /** Hostname test used for live detection as the user types. */
  test: (host: string) => boolean;
  /** Brand color used for the detected-platform glow. */
  color: string;
}

/**
 * Single source of truth for client-side platform detection.
 * Add a new platform here (and on the backend) to extend support.
 */
export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    color: '#ff0033',
    test: (h) => /(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h) || /(^|\.)youtube-nocookie\.com$/.test(h),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877f2',
    test: (h) => /(^|\.)facebook\.com$/.test(h) || /(^|\.)fb\.watch$/.test(h) || /(^|\.)fb\.com$/.test(h),
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#e1306c',
    test: (h) => /(^|\.)instagram\.com$/.test(h) || /(^|\.)instagr\.am$/.test(h),
  },
];

/** Returns the detected platform for a raw URL string, or null. */
export function detectPlatform(raw: string): PlatformMeta | null {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return PLATFORMS.find((p) => p.test(host)) ?? null;
  } catch {
    return null;
  }
}
