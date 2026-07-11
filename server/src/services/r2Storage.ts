import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { artifactHash } from './artifactCache.js';

let s3: S3Client | null = null;

function client(): S3Client | null {
  if (!config.r2.enabled) return null;
  if (!s3) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }
  return s3;
}

export function isR2Enabled(): boolean {
  return config.r2.enabled;
}

export function objectKeyFor(cacheKey: string): string {
  return `videos/${artifactHash(cacheKey)}.mp4`;
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    await c.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a cached artifact — Redis metadata first, then direct R2 HEAD by cache hash.
 * Works even when Redis is down (file already in bucket from a prior download).
 */
export async function resolveCachedArtifact(
  cacheKey: string,
): Promise<import('./artifactCache.js').CachedArtifact | null> {
  const r2Key = objectKeyFor(cacheKey);

  // R2 HEAD first — fast and works when Redis metadata is missing or slow.
  if (!(await r2ObjectExists(r2Key))) return null;

  const artifact = {
    r2Key,
    outputHeight: null,
    filename: 'video.mp4',
    bytes: 0,
    cachedAt: Date.now(),
  };

  const { getCachedArtifact, saveCachedArtifact } = await import('./artifactCache.js');
  const cached = await Promise.race([
    getCachedArtifact(cacheKey),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
  ]);
  if (cached?.r2Key === r2Key) return cached;

  logger.info(`R2 direct cache hit (no Redis metadata): ${r2Key}`);
  void saveCachedArtifact(cacheKey, artifact, config.r2.cacheTtlSec);
  return artifact;
}

export async function uploadToR2(
  localPath: string,
  cacheKey: string,
  filename: string,
): Promise<{ r2Key: string; bytes: number }> {
  const c = client();
  if (!c) throw new Error('R2 is not configured');

  const r2Key = objectKeyFor(cacheKey);
  const stat = await fsp.stat(localPath);
  const body = await fsp.readFile(localPath);

  await c.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: r2Key,
      Body: body,
      ContentType: 'video/mp4',
      ContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
      Metadata: {
        'cache-key-hash': artifactHash(cacheKey).slice(0, 32),
      },
    }),
  );

  logger.info(`R2 upload complete: ${r2Key} (${stat.size} bytes)`);
  return { r2Key, bytes: stat.size };
}

/** Presigned GET URL — user downloads directly from R2 ($0 egress). */
export async function presignedDownloadUrl(r2Key: string, filename: string): Promise<string> {
  const c = client();
  if (!c) throw new Error('R2 is not configured');

  const command = new GetObjectCommand({
    Bucket: config.r2.bucket,
    Key: r2Key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    ResponseContentType: 'video/mp4',
  });

  return getSignedUrl(c, command, { expiresIn: config.r2.presignTtlSec });
}

/** Stream an R2 object through our API (same-origin for mobile gallery blob fetch). */
export async function streamR2Object(
  r2Key: string,
  res: Response,
  filename: string,
): Promise<void> {
  const c = client();
  if (!c) throw new Error('R2 is not configured');

  const obj = await c.send(
    new GetObjectCommand({
      Bucket: config.r2.bucket,
      Key: r2Key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
      ResponseContentType: 'video/mp4',
    }),
  );

  const body = obj.Body;
  if (!body) throw new Error('Empty R2 object');

  const safe = filename.replace(/"/g, '');
  res.setHeader('Content-Type', 'video/mp4');
  if (obj.ContentLength != null && obj.ContentLength > 0) {
    res.setHeader('Content-Length', obj.ContentLength);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  if (body instanceof Readable) {
    await new Promise<void>((resolve, reject) => {
      body.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      body.pipe(res);
    });
    return;
  }

  const bytes = await body.transformToByteArray();
  res.end(Buffer.from(bytes));
}

export function safeFilenameFromPath(filePath: string): string {
  return path.basename(filePath).replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'video.mp4';
}
