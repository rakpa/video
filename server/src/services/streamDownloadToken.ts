import { randomBytes } from 'node:crypto';
import type { CodecMode, QualityId } from './formats.js';

export interface StreamDownloadEntry {
  url: string;
  qualityId: QualityId;
  mode: CodecMode;
  filename: string;
  galleryMaxHeight?: number;
  targetHeight: number;
  expiresAt: number;
}

const tokens = new Map<string, StreamDownloadEntry>();
const TOKEN_TTL_MS = 15 * 60_000;

function purgeExpired(): void {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt <= now) tokens.delete(token);
  }
}

export function issueStreamDownloadToken(entry: Omit<StreamDownloadEntry, 'expiresAt'>): string {
  purgeExpired();
  const token = randomBytes(18).toString('hex');
  tokens.set(token, { ...entry, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function consumeStreamDownloadToken(token: string): StreamDownloadEntry | null {
  purgeExpired();
  const entry = tokens.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    tokens.delete(token);
    return null;
  }
  tokens.delete(token);
  return entry;
}
