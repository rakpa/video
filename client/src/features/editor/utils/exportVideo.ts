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

/** Aggressive size/FPS caps — long seeks were the bottleneck; pixels still matter for encode. */
function exportProfile(totalDuration: number): { maxSide: number; fps: number; bitrate: number } {
  if (totalDuration > 180) return { maxSide: 720, fps: 12, bitrate: 1_200_000 };
  if (totalDuration > 90) return { maxSide: 854, fps: 14, bitrate: 1_500_000 };
  if (totalDuration > 45) return { maxSide: 960, fps: 16, bitrate: 1_800_000 };
  return { maxSide: 1280, fps: 20, bitrate: 2_200_000 };
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
    if (p >= 100 || p - last >= 2 || now - lastAt >= 250) {
      last = p;
      lastAt = now;
      onProgress(p);
    }
  };
}

/** Pick the highest playbackRate the browser accepts for sped-up capture. */
function maxPlaybackRate(video: HTMLVideoElement): number {
  for (const rate of [16, 8, 4, 2]) {
    try {
      video.playbackRate = rate;
      if (Math.abs(video.playbackRate - rate) < 0.01) return rate;
    } catch {
      /* try lower */
    }
  }
  video.playbackRate = 1;
  return 1;
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
  const { fps, bitrate } = profile;

  const target = new ArrayBufferTarget();
  // Video-only MP4 for speed — sequential play-through capture replaces slow seek-per-frame.
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

  encoder.configure({
    codec: 'avc1.42001f',
    width: outW,
    height: outH,
    bitrate,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'realtime',
    avc: { format: 'avc' },
  } as VideoEncoderConfig);

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Could not open a drawing surface for export.');

  let encodedFrames = 0;
  let timelineMicros = 0;
  const totalFramesEstimate = Math.max(1, Math.ceil(totalDuration * fps));
  const frameDurationMicros = Math.round(1_000_000 / fps);
  const keyEvery = Math.max(1, Math.round(fps * 2));

  // Keep a detached video in the document so decode is not heavily throttled.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-9999px;top:0';
  document.body.appendChild(host);

  try {
    for (const clip of clips) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      if (encodeError) throw encodeError;

      const video = document.createElement('video');
      video.src = clip.objectUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      host.appendChild(video);

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error(`Could not load ${clip.name}`));
      });

      const start = clip.trimStart;
      const end = clip.trimEnd;
      const speed = Math.max(0.25, clip.transform.speed);
      const outSpan = (end - start) / speed;
      const expectedFrames = Math.max(1, Math.ceil(outSpan * fps));

      await seekTo(video, start);
      const captureRate = maxPlaybackRate(video);
      // Source advances at captureRate * clip.speed relative to wall clock; we sample by media time.
      video.playbackRate = Math.min(16, captureRate * speed);

      let nextSrcSample = start;
      const srcStep = speed / fps;
      let clipFrameIndex = 0;
      let finished = false;
      let pumpBusy = false;

      const encodeOneFrame = async () => {
        if (clipFrameIndex >= expectedFrames) return;
        drawFrame(ctx, video, clip, canvas, outW, outH);
        const frame = new VideoFrame(drawCanvas, {
          timestamp: timelineMicros + clipFrameIndex * frameDurationMicros,
          duration: frameDurationMicros,
        });
        const keyFrame = clipFrameIndex % keyEvery === 0;
        while (encoder.encodeQueueSize > 8) {
          await new Promise((r) => setTimeout(r, 0));
        }
        encoder.encode(frame, { keyFrame });
        frame.close();
        clipFrameIndex += 1;
        encodedFrames += 1;
        report((encodedFrames / totalFramesEstimate) * 97);
        nextSrcSample += srcStep;
      };

      await new Promise<void>((resolve, reject) => {
        const fail = (err: Error) => {
          cleanup();
          reject(err);
        };
        const done = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve();
        };

        let rvfcHandle = 0;
        let rafHandle = 0;
        const hasRvfc = typeof video.requestVideoFrameCallback === 'function';

        const cleanup = () => {
          video.pause();
          video.onended = null;
          video.onerror = null;
          if (hasRvfc && rvfcHandle) {
            try {
              video.cancelVideoFrameCallback(rvfcHandle);
            } catch {
              /* ignore */
            }
          }
          if (rafHandle) cancelAnimationFrame(rafHandle);
        };

        const schedule = () => {
          if (finished) return;
          if (hasRvfc) {
            rvfcHandle = video.requestVideoFrameCallback((now, meta) => {
              void pump(now, meta);
            });
          } else {
            rafHandle = requestAnimationFrame(() => {
              void pump();
            });
          }
        };

        const pump = async (_now?: number, meta?: VideoFrameCallbackMetadata) => {
          if (finished || pumpBusy) return;
          pumpBusy = true;
          try {
            if (signal?.aborted) {
              fail(new Error('Export cancelled.'));
              return;
            }
            if (encodeError) {
              fail(encodeError);
              return;
            }

            const mediaTime =
              typeof meta?.mediaTime === 'number' ? meta.mediaTime : video.currentTime;

            while (
              clipFrameIndex < expectedFrames &&
              nextSrcSample < end - 0.0005 &&
              mediaTime + 0.0005 >= nextSrcSample
            ) {
              await encodeOneFrame();
            }

            if (mediaTime >= end - 0.04 || video.ended || clipFrameIndex >= expectedFrames) {
              done();
              return;
            }
            schedule();
          } finally {
            pumpBusy = false;
          }
        };

        video.onended = () => done();
        video.onerror = () => fail(new Error(`Playback failed while exporting ${clip.name}`));

        void video
          .play()
          .then(() => schedule())
          .catch((err) => fail(err instanceof Error ? err : new Error(String(err))));
      });

      // Fill any dropped samples from the last displayed frame (high playbackRate can skip).
      while (clipFrameIndex < expectedFrames) {
        if (signal?.aborted) throw new Error('Export cancelled.');
        if (encodeError) throw encodeError;
        await encodeOneFrame();
      }

      timelineMicros += expectedFrames * frameDurationMicros;
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
  } finally {
    host.remove();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const { buffer } = target;
  report(100);
  options.onProgress?.(100);
  const blob = new Blob([buffer as ArrayBuffer], { type: 'video/mp4' });
  if (blob.size < 64) throw new Error('Export produced an empty file. Please try again.');
  return blob;
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
  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not open a drawing surface for export.');

  // Fallback: still wall-clock, but muted + high playbackRate to finish sooner.
  const canvasStream = drawCanvas.captureStream(profile.fps);
  const mimeType = pickMime();
  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: profile.bitrate,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Export failed while recording.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.includes('mp4') ? 'video/mp4' : 'video/webm' }));
  });

  recorder.start(200);
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

/** MediaRecorder path: mute + max playbackRate so export is much shorter than realtime. */
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
  video.playbackRate = Math.min(16, maxPlaybackRate(video) * Math.max(0.25, clip.transform.speed));
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
