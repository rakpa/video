export type ClipMode = 'full' | 'clip';

export interface ClipRange {
  startTime: number;
  endTime: number;
}

const MIN_CLIP_SECONDS = 1;

/** Parse "30", "1:30", or "1:02:30" into seconds. */
export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const parts = trimmed.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Format seconds as M:SS or H:MM:SS. */
export function formatTimeInput(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function validateClipRange(
  start: number | null,
  end: number | null,
  durationSeconds: number | null,
): string | null {
  if (start == null || end == null) return 'Enter valid start and end times.';
  if (start < 0) return 'Start time cannot be negative.';
  if (end <= start) return 'End time must be after start time.';
  if (end - start < MIN_CLIP_SECONDS) return `Clip must be at least ${MIN_CLIP_SECONDS} second long.`;
  if (durationSeconds != null && durationSeconds > 0) {
    if (start >= durationSeconds) return 'Start time is beyond the video length.';
    if (end > durationSeconds + 0.5) return 'End time is beyond the video length.';
  }
  return null;
}

export function clipRangeFromInputs(
  startTime: string,
  endTime: string,
  durationSeconds: number | null,
): ClipRange | null {
  const start = parseTimeInput(startTime);
  const end = parseTimeInput(endTime);
  if (validateClipRange(start, end, durationSeconds) !== null) return null;
  const cappedEnd =
    durationSeconds != null && durationSeconds > 0 && end != null
      ? Math.min(end, durationSeconds)
      : end!;
  return { startTime: start!, endTime: cappedEnd };
}

export function formatClipRangeLabel(startTime: string, endTime: string): string {
  return `${startTime.trim()}–${endTime.trim()}`;
}
