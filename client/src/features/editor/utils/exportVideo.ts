import type { CanvasSettings, EditorClip } from '../types';
import { effectiveDuration } from '../types';

export interface ExportOptions {
  clips: EditorClip[];
  canvas: CanvasSettings;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function canvasSizeFor(clip: EditorClip, canvas: CanvasSettings): { w: number; h: number } {
  const srcW = clip.width;
  const srcH = clip.height;
  const rotated = clip.transform.rotation === 90 || clip.transform.rotation === 270;
  const baseW = rotated ? srcH : srcW;
  const baseH = rotated ? srcW : srcH;
  const crop = clip.transform.crop;
  const cropW = Math.max(1, Math.round(baseW * crop.w));
  const cropH = Math.max(1, Math.round(baseH * crop.h));

  if (canvas.aspect === 'source') {
    return { w: even(cropW), h: even(cropH) };
  }
  const [aw, ah] = canvas.aspect.split(':').map(Number);
  const targetRatio = aw / ah;
  const maxSide = Math.min(1920, Math.max(cropW, cropH));
  if (targetRatio >= 1) {
    return { w: even(maxSide), h: even(Math.round(maxSide / targetRatio)) };
  }
  return { w: even(Math.round(maxSide * targetRatio)), h: even(maxSide) };
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
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

/**
 * Export the project by playing each clip through a canvas (with crop/rotate/
 * flip/speed) and recording with MediaRecorder. Runs entirely in the browser.
 */
export async function exportEditorProject(options: ExportOptions): Promise<Blob> {
  const { clips, canvas, onProgress, signal } = options;
  if (!clips.length) throw new Error('Add at least one clip before exporting.');
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot export video. Try Chrome, Edge, or Firefox.');
  }

  const totalDuration = clips.reduce((sum, c) => sum + effectiveDuration(c), 0);
  if (totalDuration <= 0.05) throw new Error('The trimmed clip is too short to export.');

  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas);
  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not open a drawing surface for export.');

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
    videoBitsPerSecond: 4_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Export failed while recording.'));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType.includes('webm') ? 'video/webm' : mimeType }));
    };
  });

  recorder.start(250);
  let elapsed = 0;

  try {
    for (const clip of clips) {
      if (signal?.aborted) throw new Error('Export cancelled.');
      await renderClip({
        clip,
        canvas,
        ctx,
        outW,
        outH,
        audioCtx,
        dest,
        signal,
        onFrameProgress: (localPct) => {
          const clipShare = effectiveDuration(clip) / totalDuration;
          const overall = ((elapsed / totalDuration) + localPct * clipShare) * 100;
          onProgress?.(Math.min(99, Math.round(overall)));
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

interface RenderArgs {
  clip: EditorClip;
  canvas: CanvasSettings;
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  audioCtx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  signal?: AbortSignal;
  onFrameProgress?: (pct: number) => void;
}

async function renderClip(args: RenderArgs): Promise<void> {
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
  video.currentTime = start;
  await waitSeek(video);

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

function waitSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.seeking) {
      video.onseeked = () => resolve();
    } else {
      resolve();
    }
  });
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

  // Contain the cropped source in the output frame.
  const scale = Math.min(drawW / srcW, drawH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  ctx.drawImage(video, srcX, srcY, srcW, srcH, -w / 2, -h / 2, w, h);
  ctx.restore();
}
