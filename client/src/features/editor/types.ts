/** Shared types for the VidCliply browser video editor. */

export type EditorTool = 'trim' | 'crop' | 'rotate' | 'flip' | 'speed' | 'canvas';

export interface CropRect {
  /** 0–1 relative to source frame */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClipTransform {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** Playback rate 0.25–2 */
  speed: number;
  crop: CropRect;
}

export interface EditorClip {
  id: string;
  file: File;
  objectUrl: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  /** Inclusive start within the source media (seconds). */
  trimStart: number;
  /** Exclusive end within the source media (seconds). */
  trimEnd: number;
  transform: ClipTransform;
}

export interface CanvasSettings {
  /** Output / preview aspect. `source` keeps the active clip’s ratio. */
  aspect: 'source' | '16:9' | '9:16' | '1:1' | '4:5';
  background: string;
}

export const DEFAULT_TRANSFORM: ClipTransform = {
  rotation: 0,
  flipH: false,
  flipV: false,
  speed: 1,
  crop: { x: 0, y: 0, w: 1, h: 1 },
};

export const DEFAULT_CANVAS: CanvasSettings = {
  aspect: 'source',
  background: '#0f172a',
};

export function createClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export function effectiveDuration(clip: EditorClip): number {
  const raw = Math.max(0, clip.trimEnd - clip.trimStart);
  return raw / Math.max(0.25, clip.transform.speed);
}
