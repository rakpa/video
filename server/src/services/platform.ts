/**
 * Platform detection lives here. To support a new site later, add one entry
 * to this list — nothing else in the backend needs to change.
 */
export type PlatformId = 'youtube' | 'facebook' | 'instagram';

interface PlatformDef {
  id: PlatformId;
  label: string;
  /** Hostname patterns (without protocol) that identify this platform. */
  patterns: RegExp[];
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    patterns: [/(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i, /(^|\.)youtube-nocookie\.com$/i],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    patterns: [/(^|\.)facebook\.com$/i, /(^|\.)fb\.watch$/i, /(^|\.)fb\.com$/i],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    patterns: [/(^|\.)instagram\.com$/i, /(^|\.)instagr\.am$/i],
  },
];

/** Returns the matched platform, or null if the URL is from an unsupported site. */
export function detectPlatform(rawUrl: string): PlatformDef | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.patterns.some((re) => re.test(host))) ?? null;
}

export const SUPPORTED_LABELS = PLATFORMS.map((p) => p.label).join(', ');
