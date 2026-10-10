import crypto from 'node:crypto';
import type { CodecMode, QualityDef } from './formats.js';
import type { ClipRange } from '../utils/clip.js';
import { redisDel, redisGet, redisSet, redisSetNx } from '../utils/redisClient.js';
import { logger } from '../utils/logger.js';

/** Content key for download-once cache (R2 object + Redis metadata). */
export function artifactCacheKey(
  url: string,
  quality: QualityDef,
  mode: CodecMode,
  fast?: boolean,
  clip?: ClipRange | null,
  galleryPrep?: boolean,
  galleryMaxHeight?: number,
): string {
  const clipPart = clip ? `clip2:${clip.startTime}-${clip.endTime}` : 'full';
  const galleryPart = galleryPrep
    ? `gallery:${galleryMaxHeight ?? 'full'}`
    : 'nogallery';
  return `${url.trim()}|${quality.id}|${mode}|${fast ? 'fast' : 'normal'}|${clipPart}|${galleryPart}`;
}

export function artifactHash(cacheKey: string): string {
  return crypto.createHash('sha256').update(cacheKey).digest('hex');
}

const META_PREFIX = 'dl:artifact:';
const INFLIGHT_PREFIX = 'dl:inflight:';
const INFLIGHT_TTL_SEC = 2 * 60 * 60;

export interface CachedArtifact {
  r2Key: string;
  outputHeight: number | null;
  filename: string;
  bytes: number;
  cachedAt: number;
}

function metaKey(hash: string): string {
  return `${META_PREFIX}${hash}`;
}

function inflightKey(hash: string): string {
  return `${INFLIGHT_PREFIX}${hash}`;
}

export async function getCachedArtifact(cacheKey: string): Promise<CachedArtifact | null> {
  const hash = artifactHash(cacheKey);
  const raw = await redisGet(metaKey(hash));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedArtifact;
  } catch {
    return null;
  }
}

export async function saveCachedArtifact(
  cacheKey: string,
  artifact: CachedArtifact,
  ttlSeconds: number,
): Promise<void> {
  const hash = artifactHash(cacheKey);
  await redisSet(metaKey(hash), JSON.stringify(artifact), ttlSeconds);
  await redisDel(inflightKey(hash));
  logger.info(`Artifact cached: ${artifact.r2Key} (${artifact.bytes} bytes)`);
}

/** Mark this cache key as downloading on jobId (coalesce concurrent requests). */
export async function markInflight(cacheKey: string, jobId: string): Promise<boolean> {
  const hash = artifactHash(cacheKey);
  return redisSetNx(inflightKey(hash), jobId, INFLIGHT_TTL_SEC);
}

export async function clearInflight(cacheKey: string): Promise<void> {
  await redisDel(inflightKey(artifactHash(cacheKey)));
}

export async function getInflightJobId(cacheKey: string): Promise<string | null> {
  return redisGet(inflightKey(artifactHash(cacheKey)));
}
