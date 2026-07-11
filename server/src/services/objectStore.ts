import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Download-once cache on Cloudflare R2 (or any S3-compatible store).
 *
 * Finished files upload keyed by the job cache key (url+quality+mode+…), so
 * when a video goes viral the fleet downloads it from the source exactly once
 * and every other visitor gets an instant presigned URL. R2 charges no egress,
 * which removes the app servers' biggest cost: streaming video bytes.
 *
 * Everything here is optional — with no R2_* env vars the app behaves exactly
 * as before (local temp disk, server-streamed files).
 */

let client: S3Client | null | undefined;

export function objectStoreEnabled(): boolean {
  return Boolean(config.r2Endpoint && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket);
}

function s3(): S3Client | null {
  if (client !== undefined) return client;
  if (!objectStoreEnabled()) {
    client = null;
    return client;
  }
  client = new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    forcePathStyle: true, // works on R2, MinIO, and localstack alike
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
  return client;
}

/** Stable object key for a job cache key — the "download once" identity. */
export function objectKeyFor(cacheKey: string): string {
  return `videos/${crypto.createHash('sha1').update(cacheKey).digest('hex')}.mp4`;
}

export interface CachedVideoHit {
  /** Presigned GET URL the browser downloads from directly. */
  url: string;
  filename: string;
  height: number | null;
}

/** S3 metadata must be ASCII — round-trip arbitrary titles safely. */
const META_FILENAME = 'vc-filename';
const META_HEIGHT = 'vc-height';

async function presign(key: string, filename: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: config.r2Bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.\- ]+/g, '_')}"`,
    ResponseContentType: 'video/mp4',
  });
  return getSignedUrl(s3() as S3Client, cmd, { expiresIn: 60 * 60 });
}

/**
 * Cache lookup for POST /api/download. Returns a ready-to-use presigned URL on
 * a hit, or null on miss/any error — a broken bucket must never break
 * downloads, it just disables the fast path.
 */
export async function findCachedVideo(cacheKey: string): Promise<CachedVideoHit | null> {
  const c = s3();
  if (!c) return null;
  const key = objectKeyFor(cacheKey);
  try {
    const head = await c.send(
      new HeadObjectCommand({ Bucket: config.r2Bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(2500) },
    );
    let filename = 'video.mp4';
    try {
      const raw = head.Metadata?.[META_FILENAME];
      if (raw) filename = decodeURIComponent(raw);
    } catch {
      /* keep default */
    }
    const height = Number(head.Metadata?.[META_HEIGHT]) || null;
    const url = await presign(key, filename);
    return { url, filename, height };
  } catch {
    return null; // miss, timeout, or store trouble — fall through to the pipeline
  }
}

/**
 * Upload a finished file so every future request becomes a cache hit. Returns
 * the object key, or null when the store is off or the upload failed (the
 * caller keeps serving from local disk — never fail the user's download).
 */
export async function storeVideo(
  cacheKey: string,
  filePath: string,
  meta: { filename: string; height?: number | null },
): Promise<string | null> {
  const c = s3();
  if (!c) return null;
  const key = objectKeyFor(cacheKey);
  try {
    const stat = await fsp.stat(filePath);
    await c.send(
      new PutObjectCommand({
        Bucket: config.r2Bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentLength: stat.size,
        ContentType: 'video/mp4',
        Metadata: {
          [META_FILENAME]: encodeURIComponent(meta.filename || path.basename(filePath)),
          ...(meta.height ? { [META_HEIGHT]: String(meta.height) } : {}),
        },
      }),
    );
    logger.info(`Cached ${Math.round(stat.size / 1024 / 1024)} MB to object store: ${key}`);
    return key;
  } catch (err) {
    logger.warn('Object store upload failed (serving locally):', (err as Error).message);
    return null;
  }
}

/** Presigned URL for a job that was already uploaded (GET /api/file redirect). */
export async function presignStoredVideo(key: string, filename: string): Promise<string | null> {
  if (!s3()) return null;
  try {
    return await presign(key, filename);
  } catch (err) {
    logger.warn('Presign failed:', (err as Error).message);
    return null;
  }
}
