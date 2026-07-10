/** Shared client-side types — mirror the backend response shapes. */

export type PlatformId = 'youtube' | 'facebook' | 'instagram';

export type QualityId = '720' | '1080' | '1440' | '2160';

/** Codec preference. 'best' allows VP9/AV1 up to 4K; 'compatible' forces H.264/AAC ≤1080p. */
export type CodecMode = 'best' | 'compatible';

/** Highest resolution offered in compatible (H.264) mode. */
export const COMPATIBLE_MAX_HEIGHT = 1080;

export interface AvailableFormat {
  id: QualityId;
  label: string;
  tag: string;
  height: number;
  estimatedBytes: number | null;
  available: boolean;
  /** True when this resolution requires a Pro subscription. */
  premium: boolean;
}

export interface ClipRange {
  startTime: number;
  endTime: number;
}

export interface VideoInfo {
  platform: PlatformId;
  id: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  thumbnail: string | null;
  formats: AvailableFormat[];
  /** Native max height from yt-dlp (null until /api/info loads). */
  sourceMaxHeight?: number | null;
}

export interface ProgressUpdate {
  percent: number;
  speed: string | null;
  eta: string | null;
  stage: 'queued' | 'downloading' | 'merging' | 'trimming' | 'done';
  /** 1-based index of the stream currently downloading (video=1, audio=2…). */
  streamIndex: number;
  /** Total streams to download (1 = progressive, 2 = video+audio). */
  streamTotal: number;
  /** Position in the server wait queue (when stage === 'queued'). */
  queuePosition?: number;
  /** Total jobs waiting ahead of workers (when stage === 'queued'). */
  queueTotal?: number;
}

/** Top-level UI phases driving what the app renders. */
export type Phase = 'idle' | 'fetching' | 'preview' | 'ready' | 'downloading' | 'success' | 'error';
