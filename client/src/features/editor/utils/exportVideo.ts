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

function canvasSizeFor(clip: EditorClip, canvas: CanvasSettings): { w: number; h: number } {
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
    const maxSide = Math.max(cropW, cropH);
    if (targetRatio >= 1) {
      cropW = maxSide;
      cropH = Math.round(maxSide / targetRatio);
    } else {
      cropH = maxSide;
      cropW = Math.round(maxSide * targetRatio);
    }
  }

  // Cap long side for much faster encode on phones / long clips.
  const maxSide = 1280;
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
      // Fall through to MediaRecorder if a codec/config is rejected.
      console.warn('WebCodecs export failed, falling back:', err);
    }
  }
  return exportWithMediaRecorder(options, totalDuration);
}

async function exportWithWebCodecs(options: ExportOptions, totalDuration: number): Promise<Blob> {
  const { clips, canvas, onProgress, signal } = options;
  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas);

  // Fewer frames on longer clips = large speed win, still smooth enough.
  const fps = totalDuration > 90 ? 18 : totalDuration > 45 ? 20 : 24;
  const bitrate = outW * outH > 900_000 ? 2_500_000 : 1_800_000;

  const target = new ArrayBufferTarget();
  // Video-only MP4 for speed — seeking+encoding frames is already much faster
  // than real-time MediaRecorder. Full audio remux needs a demuxer; skip for now.
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
  });

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not open a drawing surface for export.');

  let encodedFrames = 0;
  let timelineMicros = 0;
  const totalFramesEstimate = Math.max(1, Math.ceil(totalDuration * fps));

  for (const clip of clips) {
    if (signal?.aborted) throw new Error('Export cancelled.');
    if (encodeError) throw encodeError;

    const video = document.createElement('video');
    video.src = clip.objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Could not load ${clip.name}`));
    });

    const start = clip.trimStart;
    const end = clip.trimEnd;
    const speed = Math.max(0.25, clip.transform.speed);
    const outSpan = (end - start) / speed;
    const frameCount = Math.max(1, Math.ceil(outSpan * fps));
    const keyEvery = Math.max(1, Math.round(fps * 2));

    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      if (encodeError) throw encodeError;

      const outT = i / fps;
      const srcT = start + outT * speed;
      await seekTo(video, Math.min(srcT, end - 0.001));
      drawFrame(ctx, video, clip, canvas, outW, outH);

      const frame = new VideoFrame(drawCanvas, {
        timestamp: timelineMicros + Math.round(outT * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      const keyFrame = i % keyEvery === 0;
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 4));
      }
      encoder.encode(frame, { keyFrame });
      frame.close();

      encodedFrames += 1;
      onProgress?.(Math.min(97, Math.round((encodedFrames / totalFramesEstimate) * 100)));
    }

    timelineMicros += Math.round(outSpan * 1_000_000);
    video.removeAttribute('src');
    video.load();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const { buffer } = target;
  onProgress?.(100);
  const blob = new Blob([buffer as ArrayBuffer], { type: 'video/mp4' });
  if (blob.size < 64) throw new Error('Export produced an empty file. Please try again.');
  return blob;
}

async function exportWithMediaRecorder(
  options: ExportOptions,
  totalDuration: number,
): Promise<Blob> {
  const { clips, canvas, onProgress, signal } = options;
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot export video. Try Chrome, Edge, or Firefox.');
  }

  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas);
  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not open a drawing surface for export.');

  // captureStream + play (muted for speed); Safari/fallback path.
  const canvasStream = drawCanvas.captureStream(30);
  const mimeType = pickMime();
  const chunks: BlobPart[] = [];

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Export failed while recording.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  recorder.start(200);
  let elapsed = 0;
  try {
    for (const clip of clips) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      await renderClipRealtime({
        clip,
        canvas,
        ctx,
        outW,
        outH,
        audioCtx,
        dest,
        signal,
        onFrameProgress: (localPct) => {
          const share = effectiveDuration(clip) / totalDuration;
          onProgress?.(Math.min(99, Math.round((elapsed / totalDuration + localPct * share) * 100)));
        },
      });
      elapsed += effectiveDuration(clip);
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    canvasStream.getTracks().forEach((t) => t.stop());
    await audioCtx.close().catch(() => undefined);
  }

  const blob = await done;
  onProgress?.(100);
  if (blob.size < 64) throw new Error('Export produced an empty file. Please try again.');
  return blob;
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

async function renderClipRealtime(args: {
  clip: EditorClip;
  canvas: CanvasSettings;
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  audioCtx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  signal?: AbortSignal;
  onFrameProgress?: (pct: number) => void;
}): Promise<void> {
  const { clip, canvas, ctx, outW, outH, audioCtx, dest, signal, onFrameProgress } = args;
  const video = document.createElement('video');
  video.src = clip.objectUrl;
  video.playsInline = true;
  video.muted = false;
  video.preload = 'auto';
  video.playbackRate = clip.transform.speed;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Could not load ${clip.name}`));
  });

  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const source = audioCtx.createMediaElementSource(video);
  source.connect(dest);

  const start = clip.trimStart;
  const end = clip.trimEnd;
  const span = Math.max(0.05, end - start);
  await seekTo(video, start);
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

  source.disconnect();
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
