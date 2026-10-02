import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { CanvasSettings, EditorClip } from '../types';
import { effectiveDuration } from '../types';

export interface ExportOptions {
  clips: EditorClip[];
  canvas: CanvasSettings;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

/**
 * Quality-first profiles. Keep up to 1080p/1920 long-side and full frame rate.
 * Speed comes from sync WebCodecs encode — not from crushing resolution/FPS.
 */
function exportProfile(totalDuration: number): { maxSide: number; fps: number } {
  const maxSide = 1920;
  const fps = totalDuration > 600 ? 24 : 30;
  return { maxSide, fps };
}

/** Solid visual bitrate from output size (≈0.14 bits/pixel/frame). */
function bitrateFor(w: number, h: number, fps: number): number {
  return Math.min(14_000_000, Math.max(3_000_000, Math.round(w * h * fps * 0.14)));
}

function canvasSizeFor(
  clip: EditorClip,
  canvas: CanvasSettings,
  maxSide: number,
): { w: number; h: number } {
  const srcW = clip.width;
  const srcH = clip.height;
  const rotated = clip.transform.rotation === 90 || clip.transform.rotation === 270;
  const baseW = rotated ? srcH : srcW;
  const baseH = rotated ? srcW : srcH;
  const crop = clip.transform.crop;
  let cropW = Math.max(1, Math.round(baseW * crop.w));
  let cropH = Math.max(1, Math.round(baseH * crop.h));

  if (canvas.aspect !== 'source') {
    const [aw, ah] = canvas.aspect.split(':').map(Number);
    const targetRatio = aw / ah;
    const side = Math.max(cropW, cropH);
    if (targetRatio >= 1) {
      cropW = side;
      cropH = Math.round(side / targetRatio);
    } else {
      cropH = side;
      cropW = Math.round(side * targetRatio);
    }
  }

  const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
  return { w: even(cropW * scale), h: even(cropH * scale) };
}

/** True when we can skip the 2D transform canvas and resize from the video directly. */
function isSimpleTransform(clip: EditorClip, canvas: CanvasSettings): boolean {
  const t = clip.transform;
  const c = t.crop;
  return (
    t.rotation === 0 &&
    !t.flipH &&
    !t.flipV &&
    c.x === 0 &&
    c.y === 0 &&
    c.w === 1 &&
    c.h === 1 &&
    canvas.aspect === 'source'
  );
}

function supportsWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not seek in the video.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.001));
    if (Math.abs(video.currentTime - target) < 0.001) {
      cleanup();
      resolve();
      return;
    }
    video.currentTime = target;
  });
}

function makeProgressReporter(onProgress?: (percent: number) => void) {
  let last = -1;
  let lastAt = 0;
  return (percent: number) => {
    if (!onProgress) return;
    const now = performance.now();
    const p = Math.min(100, Math.max(0, Math.round(percent)));
    if (p >= 100 || p - last >= 2 || now - lastAt >= 200) {
      last = p;
      lastAt = now;
      onProgress(p);
    }
  };
}

/**
 * Capture playback rate for export. Prefer a moderate speed so we still finish
 * faster than realtime without skipping most export-FPS samples.
 */
function exportPlaybackRate(video: HTMLVideoElement): number {
  for (const rate of [4, 2]) {
    try {
      video.playbackRate = rate;
      if (Math.abs(video.playbackRate - rate) < 0.05) return rate;
    } catch {
      /* try lower */
    }
  }
  video.playbackRate = 1;
  return 1;
}

async function configureEncoder(
  encoder: VideoEncoder,
  outW: number,
  outH: number,
  bitrate: number,
  fps: number,
): Promise<void> {
  // Prefer High / Main over Baseline for better compression at the same bitrate.
  const codecs = ['avc1.640028', 'avc1.4D4028', 'avc1.4D401F', 'avc1.42E01E', 'avc1.42001E'];
  let lastErr: unknown;
  for (const codec of codecs) {
    const base = {
      codec,
      width: outW,
      height: outH,
      bitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware' as const,
      latencyMode: 'quality' as const,
      avc: { format: 'avc' as const },
    } satisfies VideoEncoderConfig;

    try {
      if (typeof VideoEncoder.isConfigSupported === 'function') {
        const support = await VideoEncoder.isConfigSupported(base);
        if (!support.supported) continue;
        encoder.configure((support.config as VideoEncoderConfig) ?? base);
      } else {
        encoder.configure(base);
      }
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No supported H.264 encoder config.');
}

/**
 * Export as fast as the browser can decode+encode (WebCodecs), not wall-clock
 * real-time recording. Falls back to MediaRecorder if WebCodecs is unavailable.
 */
export async function exportEditorProject(options: ExportOptions): Promise<Blob> {
  if (!options.clips.length) throw new Error('Add at least one clip before exporting.');

  const totalDuration = options.clips.reduce((sum, c) => sum + effectiveDuration(c), 0);
  if (totalDuration <= 0.05) throw new Error('The trimmed clip is too short to export.');

  if (supportsWebCodecs()) {
    try {
      return await exportWithWebCodecs(options, totalDuration);
    } catch (err) {
      console.warn('WebCodecs export failed, falling back:', err);
    }
  }
  return exportWithMediaRecorder(options, totalDuration);
}

async function exportWithWebCodecs(options: ExportOptions, totalDuration: number): Promise<Blob> {
  const { clips, canvas, signal } = options;
  const report = makeProgressReporter(options.onProgress);
  const profile = exportProfile(totalDuration);
  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas, profile.maxSide);
  const { fps } = profile;
  const bitrate = bitrateFor(outW, outH, fps);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });

  await configureEncoder(encoder, outW, outH, bitrate, fps);

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Could not open a drawing surface for export.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const frameDurationMicros = Math.round(1_000_000 / fps);
  const keyEvery = Math.max(1, Math.round(fps * 2));
  let timelineMicros = 0;
  let encodedFrames = 0;
  let durationDone = 0;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden;left:0;top:0;z-index:-1';
  document.body.appendChild(host);

  try {
    for (const clip of clips) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      if (encodeError) throw encodeError;

      const clipFrames = await encodeClipPlaythrough({
        clip,
        canvas,
        outW,
        outH,
        fps,
        ctx,
        drawCanvas,
        host,
        encoder,
        encodeError: () => encodeError,
        timelineMicros,
        frameDurationMicros,
        keyEvery,
        signal,
        onMediaProgress: (localPct) => {
          const share = effectiveDuration(clip) / totalDuration;
          report((durationDone / totalDuration + localPct * share) * 97);
        },
      });

      encodedFrames += clipFrames;
      timelineMicros += clipFrames * frameDurationMicros;
      durationDone += effectiveDuration(clip);
      report((durationDone / totalDuration) * 97);
    }
  } finally {
    host.remove();
  }

  if (encodedFrames < 1) throw new Error('Export produced no frames. Please try again.');
  if (encodeError) throw encodeError;

  // A stalled hardware encoder must not hang the export forever — time out and
  // let the caller fall back to the MediaRecorder path.
  await Promise.race([
    encoder.flush(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Video encoder did not finish.')), 60_000),
    ),
  ]);
  encoder.close();
  muxer.finalize();

  const { buffer } = target;
  report(100);
  options.onProgress?.(100);
  const blob = new Blob([buffer as ArrayBuffer], { type: 'video/mp4' });
  if (blob.size < 64) throw new Error('Export produced an empty file. Please try again.');
  return blob;
}

/**
 * Play the trimmed range as fast as the browser allows, sample at export FPS,
 * and encode immediately. Missed samples are DROPPED — never backfilled.
 * (The previous backfill re-encoded the last frame thousands of times.)
 */
async function encodeClipPlaythrough(args: {
  clip: EditorClip;
  canvas: CanvasSettings;
  outW: number;
  outH: number;
  fps: number;
  ctx: CanvasRenderingContext2D;
  drawCanvas: HTMLCanvasElement;
  host: HTMLElement;
  encoder: VideoEncoder;
  encodeError: () => Error | null;
  timelineMicros: number;
  frameDurationMicros: number;
  keyEvery: number;
  signal?: AbortSignal;
  onMediaProgress?: (pct: number) => void;
}): Promise<number> {
  const {
    clip,
    canvas,
    outW,
    outH,
    fps,
    ctx,
    drawCanvas,
    host,
    encoder,
    encodeError,
    timelineMicros,
    frameDurationMicros,
    keyEvery,
    signal,
    onMediaProgress,
  } = args;

  const simple = isSimpleTransform(clip, canvas);
  const start = clip.trimStart;
  const end = clip.trimEnd;
  const speed = Math.max(0.25, clip.transform.speed);
  const outSpan = Math.max(0.05, (end - start) / speed);
  const srcStep = speed / fps;
  const maxFrames = Math.max(1, Math.ceil(outSpan * fps) + 2);

  const video = document.createElement('video');
  video.src = clip.objectUrl;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.disablePictureInPicture = true;
  video.style.cssText = 'width:2px;height:2px;';
  host.appendChild(video);

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Could not load ${clip.name}`));
  });

  await seekTo(video, start);
  video.playbackRate = exportPlaybackRate(video);

  let nextSrcSample = start;
  let frameIndex = 0;
  let finished = false;

  /** Sync grab+encode — awaiting createImageBitmap inside rVFC was the speed killer. */
  const encodeCurrent = (mediaTime: number): void => {
    if (frameIndex >= maxFrames) return;
    if (mediaTime + 0.0005 < nextSrcSample) return;

    // Encoder busy: retry this sample on the next callback (do not skip).
    if (encoder.encodeQueueSize > 24) return;

    // If we fell behind, catch up by encoding from the current frame once per
    // overdue sample only when within one step; otherwise advance to the nearest
    // due sample without multi-dropping a long stretch of motion.
    if (nextSrcSample + srcStep <= mediaTime + 0.0005) {
      const behind = Math.floor((mediaTime - nextSrcSample) / srcStep);
      // Allow at most a tiny catch-up skip (1 sample) to stay realtime-capable.
      if (behind > 1) nextSrcSample += srcStep * (behind - 1);
    }

    if (simple) {
      ctx.drawImage(video, 0, 0, outW, outH);
    } else {
      drawFrame(ctx, video, clip, canvas, outW, outH);
    }

    const frame = new VideoFrame(drawCanvas, {
      timestamp: timelineMicros + frameIndex * frameDurationMicros,
      duration: frameDurationMicros,
    });
    encoder.encode(frame, { keyFrame: frameIndex % keyEvery === 0 });
    frame.close();
    frameIndex += 1;
    nextSrcSample += srcStep;
    onMediaProgress?.(Math.min(1, Math.max(0, (mediaTime - start) / (end - start))));
  };

  await new Promise<void>((resolve, reject) => {
    let rvfcHandle = 0;
    let rafHandle = 0;
    const hasRvfc = typeof video.requestVideoFrameCallback === 'function';

    const cleanup = () => {
      video.pause();
      video.onended = null;
      video.onerror = null;
      video.ontimeupdate = null;
      if (hasRvfc && rvfcHandle) {
        try {
          video.cancelVideoFrameCallback(rvfcHandle);
        } catch {
          /* ignore */
        }
      }
      if (rafHandle) cancelAnimationFrame(rafHandle);
    };

    const done = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };

    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    };

    const schedule = () => {
      if (finished) return;
      if (hasRvfc) {
        rvfcHandle = video.requestVideoFrameCallback(onFrame);
      } else {
        rafHandle = requestAnimationFrame(() => onFrame());
      }
    };

    const onFrame = (_now?: number, meta?: VideoFrameCallbackMetadata) => {
      if (finished) return;
      try {
        if (signal?.aborted) {
          fail(new Error('Export cancelled.'));
          return;
        }
        const err = encodeError();
        if (err) {
          fail(err);
          return;
        }

        const mediaTime =
          typeof meta?.mediaTime === 'number' ? meta.mediaTime : video.currentTime;

        if (mediaTime >= end - 0.03 || video.ended || frameIndex >= maxFrames) {
          if (frameIndex === 0 || (mediaTime >= nextSrcSample && frameIndex < maxFrames)) {
            encodeCurrent(Math.min(mediaTime, end - 0.001));
          }
          done();
          return;
        }

        encodeCurrent(mediaTime);
        schedule();
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    video.onended = () => done();
    video.onerror = () => fail(new Error(`Playback failed while exporting ${clip.name}`));
    // Backup when rVFC is sparse at high playbackRate.
    video.ontimeupdate = () => {
      if (finished) return;
      onFrame();
    };

    void video
      .play()
      .then(() => schedule())
      .catch((err) => fail(err instanceof Error ? err : new Error(String(err))));
  });

  // Rare: high-speed play delivered almost nothing → coarse seek sampling (not per-frame).
  if (frameIndex < 2 && end - start > 0.2) {
    const step = Math.max(srcStep, (end - start) / Math.min(maxFrames, 120));
    for (let t = start; t < end && frameIndex < maxFrames; t += step) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      const err = encodeError();
      if (err) throw err;
      await seekTo(video, Math.min(t, end - 0.001));
      nextSrcSample = t;
      encodeCurrent(t);
      onMediaProgress?.(Math.min(1, (t - start) / (end - start)));
    }
  }

  video.removeAttribute('src');
  video.load();
  video.remove();

  if (frameIndex < 1) throw new Error(`No frames captured from ${clip.name}.`);
  return frameIndex;
}

async function exportWithMediaRecorder(
  options: ExportOptions,
  totalDuration: number,
): Promise<Blob> {
  const { clips, canvas, signal } = options;
  const report = makeProgressReporter(options.onProgress);
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot export video. Try Chrome, Edge, or Firefox.');
  }

  const profile = exportProfile(totalDuration);
  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas, profile.maxSide);
  const bitrate = bitrateFor(outW, outH, profile.fps);
  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not open a drawing surface for export.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const canvasStream = drawCanvas.captureStream(profile.fps);
  const mimeType = pickMime();
  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Export failed while recording.'));
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: mimeType.includes('mp4') ? 'video/mp4' : 'video/webm' }));
  });

  recorder.start(250);
  let elapsed = 0;
  try {
    for (const clip of clips) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      await renderClipFastPlayback({
        clip,
        canvas,
        ctx,
        outW,
        outH,
        signal,
        onFrameProgress: (localPct) => {
          const share = effectiveDuration(clip) / totalDuration;
          report((elapsed / totalDuration + localPct * share) * 99);
        },
      });
      elapsed += effectiveDuration(clip);
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    canvasStream.getTracks().forEach((t) => t.stop());
  }

  const blob = await done;
  options.onProgress?.(100);
  if (blob.size < 64) throw new Error('Export produced an empty file. Please try again.');
  return blob;
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

async function renderClipFastPlayback(args: {
  clip: EditorClip;
  canvas: CanvasSettings;
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  signal?: AbortSignal;
  onFrameProgress?: (pct: number) => void;
}): Promise<void> {
  const { clip, canvas, ctx, outW, outH, signal, onFrameProgress } = args;
  const video = document.createElement('video');
  video.src = clip.objectUrl;
  video.playsInline = true;
  video.muted = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Could not load ${clip.name}`));
  });

  const start = clip.trimStart;
  const end = clip.trimEnd;
  const span = Math.max(0.05, end - start);
  await seekTo(video, start);
  video.playbackRate = exportPlaybackRate(video);
  await video.play();

  await new Promise<void>((resolve, reject) => {
    let raf = 0;
    const tick = () => {
      if (signal?.aborted) {
        video.pause();
        cancelAnimationFrame(raf);
        reject(new Error('Export cancelled.'));
        return;
      }
      drawFrame(ctx, video, clip, canvas, outW, outH);
      const t = video.currentTime;
      onFrameProgress?.(Math.min(1, Math.max(0, (t - start) / span)));
      if (t >= end - 0.04 || video.ended || video.paused) {
        video.pause();
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  video.removeAttribute('src');
  video.load();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: EditorClip,
  canvas: CanvasSettings,
  outW: number,
  outH: number,
): void {
  const { rotation, flipH, flipV, crop } = clip.transform;
  ctx.fillStyle = canvas.background;
  ctx.fillRect(0, 0, outW, outH);

  const vw = video.videoWidth || clip.width;
  const vh = video.videoHeight || clip.height;
  const srcX = crop.x * vw;
  const srcY = crop.y * vh;
  const srcW = Math.max(1, crop.w * vw);
  const srcH = Math.max(1, crop.h * vh);

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

  const rotated = rotation === 90 || rotation === 270;
  const drawW = rotated ? outH : outW;
  const drawH = rotated ? outW : outH;

  const scale = Math.min(drawW / srcW, drawH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  ctx.drawImage(video, srcX, srcY, srcW, srcH, -w / 2, -h / 2, w, h);
  ctx.restore();
}
