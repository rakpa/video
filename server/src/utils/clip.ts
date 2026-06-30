export interface ClipRange {
  startTime: number;
  endTime: number;
}

export const MIN_CLIP_SECONDS = 1;

export function parseClipRange(
  body: Record<string, unknown>,
  maxDuration?: number | null,
): { ok: true; clip: ClipRange | null } | { ok: false; error: string } {
  const rawStart = body.startTime;
  const rawEnd = body.endTime;

  const hasStart = rawStart !== undefined && rawStart !== null && rawStart !== '';
  const hasEnd = rawEnd !== undefined && rawEnd !== null && rawEnd !== '';

  if (!hasStart && !hasEnd) return { ok: true, clip: null };
  if (!hasStart || !hasEnd) {
    return { ok: false, error: 'Please provide both a start time and end time for your clip.' };
  }

  const startTime = Number(rawStart);
  const endTime = Number(rawEnd);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return { ok: false, error: 'Start and end times must be valid.' };
  }

  if (startTime < 0) return { ok: false, error: 'Start time cannot be negative.' };
  if (endTime <= startTime) return { ok: false, error: 'End time must be after start time.' };
  if (endTime - startTime < MIN_CLIP_SECONDS) {
    return { ok: false, error: `Clip must be at least ${MIN_CLIP_SECONDS} second long.` };
  }

  if (maxDuration != null && maxDuration > 0) {
    if (startTime >= maxDuration) return { ok: false, error: 'Start time is beyond the video length.' };
    if (endTime > maxDuration + 0.5) {
      return { ok: false, error: 'End time is beyond the video length.' };
    }
  }

  const cappedEnd =
    maxDuration != null && maxDuration > 0 ? Math.min(endTime, maxDuration) : endTime;

  return { ok: true, clip: { startTime, endTime: cappedEnd } };
}

/** yt-dlp --download-sections time spec (seconds, e.g. *30-105). */
export function ytdlpSectionSpec(clip: ClipRange): string {
  return `*${clip.startTime}-${clip.endTime}`;
}
