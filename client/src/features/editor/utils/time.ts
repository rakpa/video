/** Time / label helpers for the editor timeline. */

export function formatEditorTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function loadVideoMeta(
  file: File,
): Promise<{ objectUrl: string; duration: number; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      cleanup();
      resolve({ objectUrl, duration, width, height });
    };
    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that video. Try MP4, WebM, or MOV.'));
    };
    video.src = objectUrl;
  });
}
