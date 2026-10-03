import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { CanvasSettings, EditorClip } from '../types';
import { effectiveDuration } from '../types';
import { extractAacSlice, type AacTrackSlice } from './audioPassthrough';

export interface ExportOptions {
  clips: EditorClip[];
  canvas: CanvasSettings;
  onProgress?: (percent: number) => void;
  /** Human-readable step, shown under the progress bar. */
  onStage?: (stage: string) => void;
  signal?: AbortSignal;
  /** Set false to export video only (used internally when audio encoding fails). */
  audio?: boolean | 'copy-only';
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

/**
 * Hidden <video> elements used by an export. iOS only allows a few active
 * decoders, so anything left over from a failed attempt must be released
 * before the next attempt — otherwise its playback never starts.
 */
const liveExportVideos = new Set<HTMLVideoElement>();
/** One hidden <video> per clip, shared by every export attempt (see prepareExportVideos). */
const exportVideoPool = new Map<string, { video: HTMLVideoElement; ready: Promise<void> }>();

/**
 * Create and start loading one hidden <video> per clip. MUST run synchronously
 * inside the tap that starts the export: iOS only loads media for elements
 * created during a user gesture, so videos opened later (a retry after the
 * hardware encoder fails, clip 2 of a merge) never fired `loadeddata` and the
 * export hung or failed. All attempts reuse these elements.
 */
function prepareExportVideos(clips: EditorClip[]): void {
  let host = document.getElementById('vc-export-videos');
  if (!host) {
    host = document.createElement('div');
    host.id = 'vc-export-videos';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden;left:0;top:0;z-index:-1';
    document.body.appendChild(host);
  }
  for (const clip of clips) {
    if (exportVideoPool.has(clip.objectUrl)) continue;
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.style.cssText = 'width:2px;height:2px;';
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${clip.name} did not load in time.`)), LOAD_TIMEOUT_MS);
      video.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Could not load ${clip.name}`));
      };
    });
    ready.catch(() => undefined);
    video.src = clip.objectUrl;
    host.appendChild(video);
    video.load();
    // Unlock playback while we still have the user gesture.
    void video
      .play()
      .then(() => video.pause())
      .catch(() => undefined);
    liveExportVideos.add(video);
    exportVideoPool.set(clip.objectUrl, { video, ready });
  }
}

async function loadedExportVideo(clip: EditorClip): Promise<HTMLVideoElement> {
  if (!exportVideoPool.has(clip.objectUrl)) prepareExportVideos([clip]);
  const entry = exportVideoPool.get(clip.objectUrl)!;
  await entry.ready;
  entry.video.pause();
  entry.video.onended = null;
  entry.video.ontimeupdate = null;
  return entry.video;
}

function releaseExportVideos(): void {
  for (const v of liveExportVideos) {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    } catch {
      /* ignore */
    }
  }
  liveExportVideos.clear();
  exportVideoPool.clear();
  document.getElementById('vc-export-videos')?.remove();
}

const LOAD_TIMEOUT_MS = 15_000;
const STALL_TIMEOUT_MS = 10_000;

/* ------------------------------- audio -------------------------------- */

const AUDIO_SAMPLE_RATE = 44_100;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 128_000;
/** Decoding holds the whole source in memory — skip sound for very large sources. */
const AUDIO_MAX_SOURCE_SECONDS = 10 * 60;
const AUDIO_MAX_SOURCE_BYTES = 150 * 1024 * 1024;
/** Decoding with Web Audio can stall on phones — never wait longer than this per clip. */
const AUDIO_DECODE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

interface AudioSegment {
  /** Planar stereo samples for this clip's trimmed (and speed-adjusted) range. */
  left: Float32Array;
  right: Float32Array;
}

type OfflineCtor = typeof OfflineAudioContext;

function offlineAudioCtor(): OfflineCtor | null {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

async function supportsAacEncoding(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    const res = await withTimeout(
      AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfChannels: AUDIO_CHANNELS,
        bitrate: AUDIO_BITRATE,
      }),
      3_000,
      { supported: false } as AudioEncoderSupport,
    );
    return Boolean(res.supported);
  } catch {
    return false;
  }
}

/**
 * Render one clip's sound for its trimmed range at the clip's speed. Returns
 * null when the clip has no usable audio (or is too large to decode safely).
 */
async function renderClipAudio(clip: EditorClip): Promise<AudioSegment | null> {
  const Offline = offlineAudioCtor();
  if (!Offline) return null;
  if (clip.duration > AUDIO_MAX_SOURCE_SECONDS || clip.file.size > AUDIO_MAX_SOURCE_BYTES) return null;

  const speed = Math.max(0.25, clip.transform.speed);
  const srcSpan = Math.max(0, clip.trimEnd - clip.trimStart);
  const outFrames = Math.ceil((srcSpan / speed) * AUDIO_SAMPLE_RATE);
  if (outFrames < 1) return null;

  try {
    const bytes = await clip.file.arrayBuffer();
    const decodeCtx = new Offline(AUDIO_CHANNELS, 1, AUDIO_SAMPLE_RATE);
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      // Callback form: older WebKit does not return a promise here.
      const p = decodeCtx.decodeAudioData(bytes, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') {
        (p as Promise<AudioBuffer>).then(resolve, reject);
      }
    });
    if (!decoded || decoded.length < 1) return null;

    const ctx = new Offline(AUDIO_CHANNELS, outFrames, AUDIO_SAMPLE_RATE);
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.playbackRate.value = speed;
    src.connect(ctx.destination);
    src.start(0, Math.min(clip.trimStart, decoded.duration), srcSpan);
    const rendered = await ctx.startRendering();
    const left = new Float32Array(rendered.getChannelData(0));
    const right =
      rendered.numberOfChannels > 1 ? new Float32Array(rendered.getChannelData(1)) : new Float32Array(left);
    return { left, right };
  } catch {
    // No audio track / unsupported codec — this clip is exported silent.
    return null;
  }
}

/** Encode prepared segments to AAC and hand the packets to the muxer. */
async function encodeAudioSegments(
  segments: Array<{ startMicros: number; segment: AudioSegment | null; frames: number }>,
  addChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void,
): Promise<void> {
  let error: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => addChunk(chunk, meta),
    error: (e) => {
      error = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: AUDIO_BITRATE,
  });

  const BLOCK = AUDIO_SAMPLE_RATE; // 1 second per AudioData
  for (const { startMicros, segment, frames } of segments) {
    for (let off = 0; off < frames; off += BLOCK) {
      if (error) throw error;
      const n = Math.min(BLOCK, frames - off);
      const data = new Float32Array(n * AUDIO_CHANNELS);
      if (segment) {
        data.set(segment.left.subarray(off, off + n), 0);
        data.set(segment.right.subarray(off, off + n), n);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: startMicros + Math.round((off / AUDIO_SAMPLE_RATE) * 1_000_000),
        data,
      });
      encoder.encode(audioData);
      audioData.close();
      // Keep the encoder queue short on phones.
      if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    }
  }
  await Promise.race([
    encoder.flush(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Audio encoder did not finish.')), 60_000),
    ),
  ]);
  encoder.close();
  if (error) throw error;
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

type Accel = 'prefer-hardware' | 'prefer-software';

async function configureEncoder(
  encoder: VideoEncoder,
  outW: number,
  outH: number,
  bitrate: number,
  fps: number,
  accel: Accel = 'prefer-hardware',
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
      hardwareAcceleration: accel,
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
  releaseExportVideos();
  prepareExportVideos(options.clips); // synchronous — still inside the tap
  try {
    return await runExport(options);
  } finally {
    releaseExportVideos();
  }
}

async function runExport(options: ExportOptions): Promise<Blob> {

  const totalDuration = options.clips.reduce((sum, c) => sum + effectiveDuration(c), 0);
  if (totalDuration <= 0.05) throw new Error('The trimmed clip is too short to export.');

  if (supportsWebCodecs()) {
    // Some devices' hardware H.264 encoder accepts frames but never returns
    // any (the export then sat at 97% forever) — retry in software before
    // falling back to the slower recorder path.
    for (const accel of ['prefer-hardware', 'prefer-software'] as const) {
      try {
        return await exportWithWebCodecs(options, totalDuration, accel);
      } catch (err) {
        if (options.signal?.aborted) throw err;
        console.warn(`WebCodecs export (${accel}) failed, falling back:`, err);
      }
    }
  }
  return exportWithMediaRecorder(options, totalDuration);
}

async function exportWithWebCodecs(
  options: ExportOptions,
  totalDuration: number,
  accel: Accel = 'prefer-hardware',
): Promise<Blob> {
  const { clips, canvas, signal } = options;
  const report = makeProgressReporter(options.onProgress);
  const profile = exportProfile(totalDuration);
  const primary = clips[0];
  const { w: outW, h: outH } = canvasSizeFor(primary, canvas, profile.maxSide);
  const { fps } = profile;
  const bitrate = bitrateFor(outW, outH, fps);

  // Sound, in order of preference:
  //  1. copy — lift the original AAC packets for each trimmed range straight
  //     into the export (no decode / re-encode; fast and light on phones).
  //     Needs every clip at normal speed with a matching AAC track.
  //  2. encode — decode with Web Audio and re-encode (speed changes, mixed
  //     sources). Time-limited, because it can stall on phones.
  //  3. none — export video only rather than hang.
  let audioSegments: Array<AudioSegment | null> = [];
  let copySlices: AacTrackSlice[] = [];
  let audioMode: 'copy' | 'encode' | 'none' = 'none';
  let audioRate = AUDIO_SAMPLE_RATE;
  let audioChannels = AUDIO_CHANNELS;

  if (options.audio !== false) {
    report(1);
    options.onStage?.('Reading sound…');
    if (clips.every((c) => Math.abs(c.transform.speed - 1) < 0.001)) {
      const slices: Array<AacTrackSlice | null> = [];
      for (const clip of clips) {
        if (signal?.aborted) throw new Error('Export cancelled.');
        slices.push(await extractAacSlice(clip.file, clip.trimStart, clip.trimEnd, signal));
        if (!slices[slices.length - 1]) break;
      }
      const first = slices[0];
      if (
        first &&
        slices.length === clips.length &&
        slices.every((s) => s && s.sampleRate === first.sampleRate && s.channels === first.channels)
      ) {
        copySlices = slices as AacTrackSlice[];
        audioMode = 'copy';
        audioRate = first.sampleRate;
        audioChannels = first.channels;
      }
    }
    if (audioMode === 'none') options.onStage?.('Preparing sound…');
    if (audioMode === 'none' && options.audio !== 'copy-only' && (await supportsAacEncoding())) {
      for (const clip of clips) {
        if (signal?.aborted) throw new Error('Export cancelled.');
        audioSegments.push(await withTimeout(renderClipAudio(clip), AUDIO_DECODE_TIMEOUT_MS, null));
      }
      if (audioSegments.some((seg) => seg !== null)) audioMode = 'encode';
      else audioSegments = [];
    }
  }
  const withAudio = audioMode === 'encode';
  options.onStage?.(`Rendering video${accel === 'prefer-software' ? ' (compatibility mode)' : ''}…`);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH },
    ...(audioMode !== 'none'
      ? { audio: { codec: 'aac' as const, numberOfChannels: audioChannels, sampleRate: audioRate } }
      : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  const clipStartMicros: number[] = [];
  const audioPlan: Array<{ startMicros: number; segment: AudioSegment | null; frames: number }> = [];

  let encodeError: Error | null = null;
  let outputChunks = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      outputChunks += 1;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });

  await configureEncoder(encoder, outW, outH, bitrate, fps, accel);

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = outW;
  drawCanvas.height = outH;
  const ctx = drawCanvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Could not open a drawing surface for export.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const startedAt = Date.now();
  let fedTotal = 0;
  const fedFrames = () => fedTotal;
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
        // A dead encoder is detected early instead of after the whole clip.
        encodeError: () =>
          encodeError ??
          (Date.now() - startedAt > 8_000 && outputChunks === 0 && fedFrames() > 15
            ? new Error('Video encoder produced no output.')
            : null),
        timelineMicros,
        frameDurationMicros,
        keyEvery,
        signal,
        onMediaProgress: (localPct) => {
          fedTotal += 1;
          const share = effectiveDuration(clip) / totalDuration;
          report((durationDone / totalDuration + localPct * share) * 97);
        },
      });

      clipStartMicros.push(timelineMicros);
      if (withAudio) {
        // Audio for this clip starts where its video starts and runs for the
        // clip's real length, so clips stay in sync.
        const seg = audioSegments[clips.indexOf(clip)] ?? null;
        const clipSamples = Math.round(effectiveDuration(clip) * AUDIO_SAMPLE_RATE);
        audioPlan.push({
          startMicros: timelineMicros,
          segment: seg,
          frames: seg ? Math.min(seg.left.length, clipSamples) : clipSamples,
        });
      }
      encodedFrames += clipFrames;
      // Advance by the clip's real length (frames are timestamped by media time).
      timelineMicros += Math.round(effectiveDuration(clip) * 1_000_000);
      durationDone += effectiveDuration(clip);
      report((durationDone / totalDuration) * 97);
    }
  } catch (err) {
    // Free the encoder before a retry / fallback takes over.
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already closed */
    }
    throw err;
  } finally {
    host.remove();
  }

  if (encodedFrames < 1) throw new Error('Export produced no frames. Please try again.');
  if (encodeError) throw encodeError;

  options.onStage?.('Finishing…');
  // A stalled hardware encoder must not hang the export forever — time out and
  // let the caller fall back to the MediaRecorder path.
  await Promise.race([
    encoder.flush(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Video encoder did not finish.')), 20_000),
    ),
  ]).catch((err) => {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already closed */
    }
    throw err;
  });
  encoder.close();

  if (audioMode === 'copy') {
    // Copy the original AAC packets, shifted to each clip's place on the timeline.
    let lastTs = -1;
    let sentConfig = false;
    copySlices.forEach((slice, i) => {
      const base = clipStartMicros[i] ?? 0;
      const clipLenMicros = Math.round(effectiveDuration(clips[i]) * 1_000_000);
      for (const pkt of slice.packets) {
        if (pkt.tsMicros >= clipLenMicros) break;
        let ts = base + pkt.tsMicros;
        if (ts <= lastTs) ts = lastTs + 1;
        lastTs = ts;
        muxer.addAudioChunkRaw(
          pkt.data,
          'key',
          ts,
          pkt.durMicros,
          sentConfig
            ? undefined
            : {
                decoderConfig: {
                  codec: 'mp4a.40.2',
                  numberOfChannels: slice.channels,
                  sampleRate: slice.sampleRate,
                  description: slice.description,
                },
              },
        );
        sentConfig = true;
      }
    });
  }

  if (withAudio) {
    try {
      await encodeAudioSegments(audioPlan, (chunk, meta) => muxer.addAudioChunk(chunk, meta));
    } catch (err) {
      // A file with a declared-but-broken audio track is worse than a silent
      // one — redo the export without sound.
      console.warn('Audio encode failed, exporting without sound:', err);
      return exportWithWebCodecs({ ...options, audio: false }, totalDuration, accel);
    }
  }
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

  void host; // videos now live in the shared export pool
  const video = await loadedExportVideo(clip);

  await seekTo(video, start);
  video.playbackRate = exportPlaybackRate(video);

  let nextSrcSample = start;
  let frameIndex = 0;
  let finished = false;
  let lastTimestamp = timelineMicros - 1;

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

    // Timestamp by real media time, not frame count: when the device drops
    // frames the clip keeps its true length (lower fps) instead of playing
    // sped-up — which also keeps it in sync with the audio track.
    const mediaMicros = Math.round((Math.max(0, mediaTime - start) / speed) * 1_000_000);
    let timestamp = timelineMicros + mediaMicros;
    if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1_000;
    lastTimestamp = timestamp;
    const frame = new VideoFrame(drawCanvas, {
      timestamp,
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

    // Watchdog: playback that stops advancing must fail, never hang the export.
    let lastTime = -1;
    let lastAdvance = Date.now();
    const watchdog = setInterval(() => {
      if (finished) return;
      const t = video.currentTime;
      if (t !== lastTime) {
        lastTime = t;
        lastAdvance = Date.now();
      } else if (Date.now() - lastAdvance > STALL_TIMEOUT_MS) {
        fail(new Error('Playback stalled while exporting.'));
      }
    }, 1_000);

    const cleanup = () => {
      clearInterval(watchdog);
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

  video.pause();

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

  options.onStage?.('Recording video (slow mode, no sound)…');
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
    // MP4 first: Photos on iPhone cannot store WebM.
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
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
  const video = await loadedExportVideo(clip);

  const start = clip.trimStart;
  const end = clip.trimEnd;
  const span = Math.max(0.05, end - start);
  await seekTo(video, start);
  video.playbackRate = exportPlaybackRate(video);
  await video.play();

  await new Promise<void>((resolve, reject) => {
    let raf = 0;
    let lastTime = -1;
    let lastAdvance = Date.now();
    const tick = () => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastAdvance = Date.now();
      } else if (Date.now() - lastAdvance > STALL_TIMEOUT_MS) {
        video.pause();
        cancelAnimationFrame(raf);
        reject(new Error('Playback stalled while exporting.'));
        return;
      }
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

  video.pause();
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
